#version 400 core
#define FAR_PLANE 50.
#define EPSILON 0.0001

out vec4 frag_color;
uniform uvec2 uRes;
uniform float uTime;

struct Light {
    vec3 position;
    vec3 color;
    float intensity;
};

struct Object {
    float distance;
    int material_id;
};

struct Material {
    vec3 color;
    float emission;
    float roughness;
};

Light light_sources[1];
Material materials[3];
// Structs for refactoring later on

Material id_to_mat(int id) {
    // Wood
    if (id == 0) {
        return Material(vec3(.8, .5, .21), 0., 0.);
    }
    // Rails
    if (id == 1) {
        return Material(vec3(1.), 0., 0.);
    }
    // Walls
    if (id == 2) {
        return Material(vec3(0.271, 0.255, 0.247), 0., 0.);
    }
    return Material(vec3(.8, .5, .21), 0., 0.);
}

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
    return Object(dist, object_1.material_id);
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
    return Object(length(max(q, 0.)) + min( max( q.x, max(q.y, q.z)), 0. ) - rounding, material_id);
}

// A sphere
Object sdSphere(vec3 pos,  float radius, int material_id) {
    return Object(length(pos) - radius, material_id);
}

Object sdCappedCylinder( vec3 pos, float height, float radius, int material_id)
{
  vec2 d = abs(vec2(length(pos.xz),pos.y)) - vec2(height,radius);
  return Object(min(max(d.x,d.y),0.0) + length(max(d,0.0)), material_id);
}

// A plane oriented using a normal
Object sdPlane(vec3 pos, vec4 normal, int material_id) {
    return Object(dot(pos, normal.xyz) + normal.w, material_id);
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

float sdCart(vec3 ray_pos) {
    return 1999;//sdCappedCylinder(opTx(ray_pos - path(uTime) - vec3(0.,-2.,8.), matRotZ(90)), 1., 1.);
}

Object sdGround(vec3 ray_pos) {
    return sdPlaneY(ray_pos, /*0.5*noise(ray_pos)*/ 0.2, 2);
}

Object sdTunnel(vec3 ray_pos, float size) {
    Object wall_distance = Object(size - length(ray_pos.xy*vec2(1, 1)), 2);


    Object ground_distance = sdGround(ray_pos);

    //wall_distance = opSmoothUnion(wall_distance, ground_distance,2 );

    wall_distance = Object(sdFbm(ray_pos, wall_distance.distance), wall_distance.material_id);

    // Draw the wooden beams
    Object beam_distance = sdWoodBeams(opRep(ray_pos, vec3(0., 0., 3)), size-0.7);

    return opSharpUnion(wall_distance, beam_distance);
    //return opSmoothUnion(beam_distance, wall_distance, 0.05);
}

// *********
// Rendering
// *********

// Renderer based on https://github.com/electricsquare/raymarching-workshop

Object map(vec3 pos){
    Object tunnel_distance = sdTunnel(pos, 5);

    Object track_distance = sdCartTrack(pos, 2);

    Object scene_distance = opSharpUnion(tunnel_distance, track_distance);

    return scene_distance;
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
        if (d > FAR_PLANE) return -1;
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
        if (d > FAR_PLANE) return -1;
        t += d;
    }
    return t;
}

// Shadow calculation inspired from https://iquilezles.org/articles/rmshadows/
// Specifically https://www.shadertoy.com/view/lsf3zr
vec3 light_scan(vec3 pos) {
    Light light = light_sources[0];
    // TODO:Iterate over the light sources and take all of them into consideration
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

vec3 gamma_correction(vec3 col) {
    return pow(col, vec3(0.4545));
}

vec3 render(vec3 ray_origin, vec3 ray_direction) {

    vec3 col = vec3(.8, .5, .21);

    float t = ray(ray_origin, ray_direction);
    if (t > 0.){
        vec3 pos = ray_origin + t*ray_direction;
        vec3 nor = calcNormal(pos);
        Object object = map(pos);



        col = materials[object.material_id].color * max(dot(normalize(ray_direction), nor), 0.) * light_scan(pos);
    }
    col = mix(col , vec3(.0, .0, .0), smoothstep(0., .95, t*2/FAR_PLANE));

    if (light_ray(ray_origin, ray_direction) > 0) {
        col = vec3(1., 0, 0);
    }
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
    // vec2 result = 2. * (screenCoords/uRes.xy - 0.5);
    // result.y *= uRes.x / uRes.y;

    // return result;

    return (2*screenCoords - vec2(uRes.xy)) / float(uRes.y);
}

void main()
{
    // Wood
    materials[0] = Material(vec3(.8, .5, .21), 0., 0.);
    // Rails
    materials[1] = Material(vec3(1.), 0., 0.);
    // Wall
    materials[2] = Material(vec3(0.271, 0.255, 0.247), 0., 0.);

    // vec2 uv = (2*gl_FragCoord.xy - vec2(uRes.xy)) / float(uRes.y);
    vec2 uv = normalizeScreenCoords(gl_FragCoord.xy);

    vec3 camera_origin = camera_path(uTime);
    vec3 camera_target = vec3(0., 0., 3.) + path(uTime) + vec3(4.,-1.5,0);

    light_sources[0] = Light(camera_target, vec3(1., 0., 0.), 0.);

    vec3 camera_direction = getCameraRayDir(uv, camera_origin, camera_target);//normalize(vec3(p.xy, -1.));

    vec3 col = render(camera_origin, camera_direction);
    
    frag_color = vec4(col, 1.0);
}