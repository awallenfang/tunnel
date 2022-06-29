#version 450 core
#define FAR_PLANE 50.
#define EPSILON 0.0001
#define PI 3.14159

out vec4 frag_color;
uniform uvec2 uRes;
uniform float uTime;
uniform int time_seed;
uniform int samples;

struct Light {
    vec3 position;
    vec3 color;
    float intensity;
};

struct Material {
    vec3 color;
    vec3 emission;
    float roughness;
};

struct Object {
    float distance;
    Material material;
};

Light light_sources[1];
Material materials[7];


// A single iteration of Bob Jenkins' One-At-A-Time hashing algorithm.
uint hash( uint x ) {
    x += ( x << 10u );
    x ^= ( x >>  6u );
    x += ( x <<  3u );
    x ^= ( x >> 11u );
    x += ( x << 15u );
    return x;
}

// Compound versions of the hashing algorithm I whipped together.
uint hash( uvec2 v ) { return hash( v.x ^ hash(v.y)                         ); }
uint hash( uvec3 v ) { return hash( v.x ^ hash(v.y) ^ hash(v.z)             ); }
uint hash( uvec4 v ) { return hash( v.x ^ hash(v.y) ^ hash(v.z) ^ hash(v.w) ); }

// Construct a float with half-open range [0:1] using low 23 bits.
// All zeroes yields 0.0, all ones yields the next smallest representable value below 1.0.
float floatConstruct( uint m ) {
    const uint ieeeMantissa = 0x007FFFFFu; // binary32 mantissa bitmask
    const uint ieeeOne      = 0x3F800000u; // 1.0 in IEEE binary32

    m &= ieeeMantissa;                     // Keep only mantissa bits (fractional part)
    m |= ieeeOne;                          // Add fractional part to 1.0

    float  f = uintBitsToFloat( m );       // Range [1:2]
    return f - 1.0;                        // Range [0:1]
}

// Pseudo-random value in half-open range [0:1].
float random( float x ) { return floatConstruct(hash(floatBitsToUint(x))); }
float random( vec2  v ) { return floatConstruct(hash(floatBitsToUint(v))); }
float random( vec3  v ) { return floatConstruct(hash(floatBitsToUint(v))); }
float random( vec4  v ) { return floatConstruct(hash(floatBitsToUint(v))); }

float hash(vec3 p)  
{
    p  = 17.0*fract( p*0.3183099+vec3(.11,.17,.13) );
    return fract( p.x*p.y*p.z*(p.x+p.y+p.z) );
}

float sdBase( in vec3 p )
{
    vec3 i = floor(p);
    vec3 f = fract(p);

	#define RAD(r) ((r)*(r)*0.7)
    #define SPH(i,f,c) length(f-c)-RAD(hash(i+c))
    
    return min(min(min(SPH(i,f,vec3(0,0,0)),
                       SPH(i,f,vec3(0,0,1))),
                   min(SPH(i,f,vec3(0,1,0)),
                       SPH(i,f,vec3(0,1,1)))),
               min(min(SPH(i,f,vec3(1,0,0)),
                       SPH(i,f,vec3(1,0,1))),
                   min(SPH(i,f,vec3(1,1,0)),
                       SPH(i,f,vec3(1,1,1)))));
}

// https://iquilezles.org/articles/smin
float smax( float a, float b, float k )
{
    float h = max(k-abs(a-b),0.0);
    return max(a, b) + h*h*0.25/k;
}

float smin( float a, float b, float k )
{
    float h = max( k-abs(a-b), 0.0 )/k;
    return min( a, b ) - h*h*k*(1.0/4.0);
}

float sdFbm( vec3 p, float d )
{
   float s = 1.0;
   for( int i=0; i<4; i++ )
   {
       // evaluate new octave
       float n = s*sdBase(p);
	
       // add
       n = smax(n,d-0.1*s,0.3*s);
       d = smin(n,d      ,0.3*s);
	
       // prepare next octave
       p = mat3( 0.00, 1.60, 1.20,
                -1.60, 0.72,-0.96,
                -1.20,-0.96, 1.28 )*p;
       s = 0.5*s;
   }
   return d;
}

// A mod(float, int) without weird precision loss on the float
float modulo(float n, int val) {
    return (int(n) % val) + fract(n);
}

// The path the camera takes, ran over using t
vec3 path(float t) {
    return vec3(0., 3., 2*t);
}

vec3 camera_path(float t) {
    return vec3(cos(t), 3. + 0.8*sin(t), 2*t);
}


// **********************
// General SDF operations
// **********************

// A sharp union, basically just min()
Object opSharpUnion(Object object_1, Object object_2) {
    return (object_1.distance < object_2.distance ? object_1 : object_2);
}

// A smooth combination of two objects, taken from Inigo Quilez
Object opSmoothUnion(Object object_1, Object object_2, float smoothness) {
    // TODO: Decide how to do the material smoothing
    float h = clamp( 0.5 + 0.5*(object_2.distance-object_1.distance)/smoothness, 0.0, 1.0 );

    float dist = mix( object_2.distance, object_1.distance, h ) - smoothness*h*(1.0-h);
    return Object(dist, object_1.material);
}

// A repetition operator, taken from Inigo Quilez
vec3 opRep( in vec3 ray_pos, in vec3 repeat_direction)
{
    vec3 q = mod(ray_pos+0.5*repeat_direction,repeat_direction)-0.5*repeat_direction;
    return q;
}

vec3 opTx(in vec3 ray_pos, in mat3 transform) {
    return inverse(transform) * ray_pos;
}

// ******************************
// General matrix transformations
// ******************************

mat3 matRotX(float angle) {
    mat3 rotation = mat3(0.);
    rotation[0][0] = 1.;
    rotation[1][2] = - sin(radians(angle));
    rotation[1][1] = cos(radians(angle));
    rotation[2][1] = sin(radians(angle));
    rotation[2][2] = cos(radians(angle));

    return rotation;
}
mat3 matRotY(float angle) {
    mat3 rotation = mat3(0.);
    rotation[0][0] = cos(radians(angle));
    rotation[2][0] = - sin(radians(angle));
    rotation[1][1] = 1.;
    rotation[0][2] = sin(radians(angle));
    rotation[2][2] = cos(radians(angle));

    return rotation;
}
mat3 matRotZ(float angle) {
    mat3 rotation = mat3(0.);
    rotation[0][0] = cos(radians(angle));
    rotation[0][1] = sin(radians(angle));
    rotation[1][1] = cos(radians(angle));
    rotation[1][0] = -sin(radians(angle));
    rotation[2][2] = 1.;

    return rotation;
}

// **************
// SDF primitives
// **************

// A box. shape are the directional radii, rounding allows rounding
Object sdBox(vec3 pos, vec3 shape, float rounding, int material_id) {
    vec3 q = abs(pos) - shape;
    return Object(length(max(q, 0.)) + min( max( q.x, max(q.y, q.z)), 0. ) - rounding, materials[material_id]);
}

// A sphere
Object sdSphere(vec3 pos,  float radius, int material_id) {
    return Object(length(pos) - radius, materials[material_id]);
}

Object sdCappedCylinder( vec3 pos, float height, float radius, int material_id)
{
  vec2 d = abs(vec2(length(pos.xz),pos.y)) - vec2(height,radius);
  return Object(min(max(d.x,d.y),0.0) + length(max(d,0.0)), materials[material_id]);
}

// A plane oriented using a normal
Object sdPlane(vec3 pos, vec4 normal, int material_id) {
    return Object(dot(pos, normal.xyz) + normal.w, materials[material_id]);
}

// An infinite horizontal plane
Object sdPlaneY(vec3 pos, float offset, int material_id) {
    return sdPlane(pos, vec4(0., 1., 0., offset), material_id);
}

// *******************
// Combined primitives
// *******************

// Distance function of the rails with details
Object sdTrack(vec3 ray_pos) {
    Object top_box = sdBox(ray_pos - vec3(0.,0.18,0.), vec3(0.15,0.01,10.), 0., 1);
    Object middle_box = sdBox(ray_pos - vec3(0., 0.08, 0.), vec3(0.08,0.08,10.), 0., 1);
    Object bottom_box = sdBox(ray_pos - vec3(0.,0.0,0.), vec3(0.15,0.01,10.), 0., 1);
    return opSharpUnion(opSharpUnion(top_box, middle_box), bottom_box);
}

Object sdWoodBeams(vec3 ray_pos, float size) {
    Object top_bar = sdBox(ray_pos - vec3(0., size, 0.), vec3(size,0.2,0.2), 0., 0);
    Object left_bar = sdBox(ray_pos - vec3(-(size-1), 2, 0.), vec3(0.2,size+2,0.2), 0., 0);
    Object right_bar = sdBox(ray_pos - vec3((size-1), 2, 0.), vec3(0.2,size+2,0.2), 0., 0);

    return opSmoothUnion(top_bar, opSmoothUnion(left_bar, right_bar, 0.1), 0.1);
}

// Distance function of the rail track, where distance is the distance between boards
Object sdCartTrack(vec3 ray_pos, int distance) {
    // Draw the wooden boards
    ray_pos = opRep(ray_pos, vec3(0., 0., distance));

    Object board_distance = sdBox(ray_pos, vec3(2,0.1,0.4), 0.00, 0);

    // Draw board rail connectors
    Object connector_right_distance = sdBox(ray_pos - vec3(.85, .15, 0), vec3(.05), .0, 0);
    Object connector_left_distance = sdBox(ray_pos - vec3(-0.85, .15, 0), vec3(.05), .0, 0);

    Object connector_distance = opSharpUnion(connector_left_distance, connector_right_distance);

    // Combine connector with boards
    board_distance = opSharpUnion(board_distance, connector_distance);

    // Draw the rails with details
    Object left_track = sdTrack(ray_pos - vec3(-1., 0.15, 0.));
    Object right_track = sdTrack(ray_pos - vec3(1., 0.15, 0.));

    Object track_distance = opSharpUnion(left_track, right_track);


    // Combine the rails and the board
    return opSharpUnion(board_distance, track_distance);
}

// float sdCart(vec3 ray_pos) {
//     return 1999;//sdCappedCylinder(opTx(ray_pos - path(uTime) - vec3(0.,-2.,8.), matRotZ(90)), 1., 1.);
// }

Object sdGround(vec3 ray_pos) {
    return sdPlaneY(ray_pos, /*0.5*noise(ray_pos)*/ 0.2, 2);
}

Object sdBlueGems(vec3 ray_pos, int radius) {
    Object min_object = Object(FAR_PLANE, materials[4]);

    for (int i = 0; i<30; i++) {
        Object iter_object = sdBox(ray_pos - vec3(cos(i * 0.4) * radius, sin(i * 0.4) * radius, i * 2), vec3(.2), 0., 4);

        if (iter_object.distance < min_object.distance) {
            min_object = iter_object;
        }
    }
    return min_object;
}

Object sdRedGems(vec3 ray_pos, int radius) {
    Object min_object = Object(FAR_PLANE, materials[5]);

    for (int i = 0; i<30; i++) {
        Object iter_object = sdBox(ray_pos - vec3(cos(i * 0.6 + 1) * radius, sin(i * 0.6 + 1) * radius, i * 2 + 1), vec3(.2), 0., 5);

        if (iter_object.distance < min_object.distance) {
            min_object = iter_object;
        }
    }
    return min_object;
}

Object sdGreenGems(vec3 ray_pos, int radius) {
    Object min_object = Object(FAR_PLANE, materials[6]);

    for (int i = 0; i<30; i++) {
        Object iter_object = sdBox(ray_pos - vec3(cos(i * 0.5 + 2) * radius, sin(i * 0.5 + 2) * radius, i * 2 + 1), vec3(.2), 0., 6);

        if (iter_object.distance < min_object.distance) {
            min_object = iter_object;
        }
    }
    return min_object;
}


Object sdTunnel(vec3 ray_pos, float size) {
    Object wall_distance = Object(size - length(ray_pos.xy*vec2(1, 1)), materials[2]);


    Object ground_distance = sdGround(ray_pos);

    wall_distance = opSmoothUnion(wall_distance, ground_distance,2 );

    wall_distance = Object(sdFbm(ray_pos, wall_distance.distance), materials[2]);

    // Draw the wooden beams
    Object beam_distance = sdWoodBeams(opRep(ray_pos, vec3(0., 0., 3)), size-0.7);

    Object gems_distance = sdBlueGems(ray_pos, 5);
    gems_distance = opSharpUnion(gems_distance, sdRedGems(ray_pos, 5));
    gems_distance = opSharpUnion(gems_distance, sdGreenGems(ray_pos, 5));

    return opSharpUnion(wall_distance, opSharpUnion(beam_distance, gems_distance));
    //return opSmoothUnion(beam_distance, wall_distance, 0.05);
}

// *********
// Rendering
// *********

Object map(vec3 pos){
    Object tunnel_distance = sdTunnel(pos, 5);

    Object track_distance = sdCartTrack(pos, 2);

    Object scene_distance = opSharpUnion(tunnel_distance, track_distance);

    Object light = sdSphere(pos - vec3(0., 0., 3.) - path(uTime), .2, 3);

    return opSharpUnion(scene_distance, light);
}

Object light_map(vec3 pos) {
    return sdSphere(pos - light_sources[0].position, 0.1, 1);
}

vec3 calcNormal(vec3 p){
    vec2 e = vec2(EPSILON, 0.);

    float d = map(p).distance;

    vec3 gradient = d - vec3(
    map(p + e.xyy).distance,
    map(p + e.yxy).distance,
    map(p + e.yyx).distance
    );

    return normalize(gradient);
}

float ray(vec3 ray_origin, vec3 ray_direction){
    float t = 0.;

    uint steps = 100;

    for (int i=0; i<steps; i++) {
        vec3 pos = ray_origin + t*ray_direction;

        float d = map(pos).distance;
        
        if( d < EPSILON * t) return t;
        if (d > FAR_PLANE) return -1.;
        t += d;
    }
    return t;
}

float light_ray(vec3 ray_origin, vec3 ray_direction){
    float t = 0.;

    uint steps = 100;

    for (int i=0; i<steps; i++) {
        vec3 pos = ray_origin + t*ray_direction;

        float d = light_map(pos).distance;
        
        if( d < EPSILON * t) return t;
        if (d > FAR_PLANE) return -1.;
        t += d;
    }
    return t;
}

// Shadow calculation inspired from https://iquilezles.org/articles/rmshadows/
// Specifically https://www.shadertoy.com/view/lsf3zr
vec3 light_scan(vec3 pos) {
    Light light = light_sources[0];
    // TODO: Iterate over the light sources and take all of them into consideration
    // TODO: Path tracing
    vec3 light_direction = normalize(light.position - pos);
    float max_t = distance(pos,light.position);

    float res = 1.0;
    float k = 8;
    float t = 0.;

    for (int i = 0; i<32; i++) {
        float h = map(pos + light_direction * t).distance;
        res = min(res, k*h/t);
        t += clamp(h, 0.1, 1.);
        if (res < EPSILON || t > max_t) break; 
    }

    return clamp(res, 0.01, 1.) * light.color;
}

// ***********
// Path Tracer
// ***********

//https://raytracing.github.io/books/RayTracingInOneWeekend.html
vec3 random_from_unit_sphere(inout uint sample_seed) {
    while (true) {
        float x = random(vec4(gl_FragCoord.xy, uTime, sample_seed));
        sample_seed += 1;
        float y = random(vec4(gl_FragCoord.xy, uTime, sample_seed));
        sample_seed += 1;
        float z = random(vec4(gl_FragCoord.xy, uTime, sample_seed));
        sample_seed += 1;

        vec3 vector = vec3(x,y,z);

        if (length(vector) >= 1) {
            continue;
        }

        return vector;
    }
}

uint wang_hash(inout uint seed)
{
    seed = uint(seed ^ uint(61)) ^ uint(seed >> uint(16));
    seed *= uint(9);
    seed = seed ^ (seed >> 4);
    seed *= uint(0x27d4eb2d);
    seed = seed ^ (seed >> 15);
    return seed;
}

float RandomFloat01(inout uint seed)
{
    return float(wang_hash(seed)) / 4294967296.0;
}

vec3 RandomUnitVector(inout uint seed)
{
    float z = RandomFloat01(seed) * 2.0f - 1.0f;
    float a = RandomFloat01(seed) * 2 * 3.14159265359f;
    float r = sqrt(1.0f - z * z);
    float x = r * cos(a);
    float y = r * sin(a);

    return vec3(x, y, z);
}


// Based on: https://github.com/quaiquai/ProjectLink-GLSL-Path-Tracer/blob/master/shaders/pathtracing_main.fs
vec3 trace_path(in vec3 ray_origin, in vec3 ray_direction, int max_depth, inout uint seed) {
    wang_hash(seed);
    vec3 radiance = vec3(0.);
    vec3 throughput = vec3(1.);

    vec3 origin = ray_origin;
    vec3 direction = ray_direction;

    for (int depth = 0; depth <= max_depth; depth++) {
        float t = ray(origin, direction);
        vec3 hit_pos = origin + t*direction;
        vec3 normal = calcNormal(hit_pos);
        Object object = map(hit_pos);

        // Recalculate the positional values
        origin = hit_pos + EPSILON * normal;
        direction = normalize(reflect(direction, normal) + RandomUnitVector(seed));
        

        // TODO: Percent specular

        radiance += object.material.emission * throughput;

        throughput *= object.material.color;

        // Russian Roulette
        float p = max(throughput.x, max(throughput.y, throughput.z));
        if (RandomFloat01(seed) > p) break;

        throughput *= 1. / p;

    }
    

    return radiance;
}

vec3 gamma_correction(vec3 col) {
    return pow(col, vec3(0.4545));
}

vec3 render(vec3 ray_origin, vec3 ray_direction, inout uint seed) {
    int samples = 1;
    vec3 col = vec3(0.);

    for (int i = 0; i < samples; i++) {
        col += trace_path(ray_origin, ray_direction, 3, seed);
    }
    col /= samples;

    // vec3 col = vec3(.8, .5, .21);

    // float t = ray(ray_origin, ray_direction);
    // if (t > 0.){
    //     vec3 pos = ray_origin + t*ray_direction;
    //     vec3 nor = calcNormal(pos);
    //     Object object = map(pos);

    //     col = object.material.color * max(dot(normalize(ray_direction), nor), 0.) * light_scan(pos);
    // }
    // col = mix(col , vec3(.0, .0, .0), smoothstep(0., .95, t*2/FAR_PLANE));

    // if (light_ray(ray_origin, ray_direction) > 0) {
    //     col = vec3(1., 0, 0);
    // }
    return gamma_correction(col);
}

vec3 getCameraRayDir(vec2 uv, vec3 camPos, vec3 camTarget) {
    // Calculate camera's transform matrix components

    vec3 camForward = normalize(camTarget - camPos);
    vec3 camRight = normalize(cross(vec3(0., 1., 0.), camForward));
    vec3 camUp = normalize(cross(camForward, camRight));

    float fPersp = 1.0;

    vec3 vDir = normalize(uv.x * camRight + uv.y * camUp + camForward * fPersp);

    return vDir;
}

vec2 normalizeScreenCoords(vec2 screenCoords) {
    return (2*screenCoords - vec2(uRes.xy)) / float(uRes.y);
}

void main()
{
    
    uint sample_seed = uint(uint(gl_FragCoord.x) * uint(1973) + uint(gl_FragCoord.y) * uint(9277) + uint(uTime) * uint(26699) + time_seed) | uint(1);

    // Wood
    materials[0] = Material(vec3(.8, .5, .21), vec3(0.), 0.);
    // Rails
    materials[1] = Material(vec3(1.), vec3(0.), 0.);
    // Wall
    materials[2] = Material(vec3(0.271, 0.255, 0.247), vec3(0.), 0.);
    // Light
    materials[3] = Material(vec3(1.), vec3(1., 245./255., 182./255.), 0.);
    // Blue gem
    materials[4] = Material(vec3(0., 0., 1.), vec3(0., 0., 1.), 0.);
    // Red gem
    materials[5] = Material(vec3(0., 0., 1.), vec3(1., 0., 0.), 0.);
    // Green gem
    materials[6] = Material(vec3(0., 0., 1.), vec3(0., 1., 0.), 0.);


    // vec2 uv = (2*gl_FragCoord.xy - vec2(uRes.xy)) / float(uRes.y);
    vec2 uv = normalizeScreenCoords(gl_FragCoord.xy);

    vec3 camera_origin = camera_path(uTime);
    vec3 camera_target = vec3(0., 0., 3.) + path(uTime);

    //TODO: Implement jitter for light Antialiasing

    light_sources[0] = Light(camera_target, vec3(1.), 0.);

    vec3 camera_direction = getCameraRayDir(uv, camera_origin, camera_target);

    vec3 col = render(camera_origin, camera_direction, sample_seed);

    frag_color = vec4(col, 1. / float(samples));
}
