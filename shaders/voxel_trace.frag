#version 400 core
#define FAR_PLANE 50.
#define EPSILON 0.001

out vec4 frag_color;

uniform uvec2 uRes;
uniform float uTime;

float mod289(float x){return x - floor(x * (1.0 / 289.0)) * 289.0;}
vec4 mod289(vec4 x){return x - floor(x * (1.0 / 289.0)) * 289.0;}
vec4 perm(vec4 x){return mod289(((x * 34.0) + 1.0) * x);}

float noise(vec3 p){
    vec3 a = floor(p);
    vec3 d = p - a;
    d = d * d * (3.0 - 2.0 * d);

    vec4 b = a.xxyy + vec4(0.0, 1.0, 0.0, 1.0);
    vec4 k1 = perm(b.xyxy);
    vec4 k2 = perm(k1.xyxy + b.zzww);

    vec4 c = k2 + a.zzzz;
    vec4 k3 = perm(c);
    vec4 k4 = perm(c + 1.0);

    vec4 o1 = fract(k3 * (1.0 / 41.0));
    vec4 o2 = fract(k4 * (1.0 / 41.0));

    vec4 o3 = o2 * d.z + o1 * (1.0 - d.z);
    vec2 o4 = o3.yw * d.x + o3.xz * (1.0 - d.x);

    return o4.y * d.y + o4.x * (1.0 - d.y);
    // return 0.;
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
float opSharpUnion(float object_1, float object_2) {
    return min(object_1, object_2);
}

// A smooth combination of two objects, taken from Inigo Quilez
float opSmoothUnion(float object_1, float object_2, float smoothness) {
    float h = clamp( 0.5 + 0.5*(object_2-object_1)/smoothness, 0.0, 1.0 );
    return mix( object_2, object_1, h ) - smoothness*h*(1.0-h);;
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
float sdBox(vec3 pos, vec3 shape, float rounding) {
    vec3 q = abs(pos) - shape;
    return length(max(q, 0.)) + min( max( q.x, max(q.y, q.z)), 0. ) - rounding;
}

// A sphere
float sdSphere(vec3 pos,  float radius) {
    return length(pos) - radius;
}

float sdCappedCylinder( vec3 pos, float height, float radius )
{
  vec2 d = abs(vec2(length(pos.xz),pos.y)) - vec2(height,radius);
  return min(max(d.x,d.y),0.0) + length(max(d,0.0));
}

// A plane oriented using a normal
float sdPlane(vec3 pos, vec4 normal) {
    return dot(pos, normal.xyz) + normal.w;
}

// An infinite horizontal plane
float sdPlaneY(vec3 pos, float offset) {
    return sdPlane(pos, vec4(0., 1., 0., offset));
}

float sdTriPrism(vec3 pos, vec3 p, vec2 h )
{
    p -= pos;
    vec3 q = abs(p);
    return max(q.z-h.y,max(q.x*0.866025+p.y*0.5,-p.y)-h.x*0.5);
}

// *******************
// Combined primitives
// *******************

// Distance function of the rails with details
float sdTrack(vec3 ray_pos) {
    float top_box = sdBox(ray_pos - vec3(0.,0.18,0.), vec3(0.15,0.01,10.), 0.);
    float middle_box = sdBox(ray_pos - vec3(0., 0.08, 0.), vec3(0.08,0.08,10.), 0.);
    float bottom_box = sdBox(ray_pos - vec3(0.,0.0,0.), vec3(0.15,0.01,10.), 0.);
    return min(min(top_box, middle_box), bottom_box);
}

float sdWoodBeams(vec3 ray_pos, float size) {
    float top_bar = sdBox(ray_pos - vec3(0., size, 0.), vec3(size,0.2,0.2), 0.05);
    float left_bar = sdBox(ray_pos - vec3(-(size-1), 2, 0.), vec3(0.2,size,0.2), 0.05);
    float right_bar = sdBox(ray_pos - vec3((size-1), 2, 0.), vec3(0.2,size,0.2), 0.05);

    return opSmoothUnion(top_bar, opSmoothUnion(left_bar, right_bar, 0.1), 0.1);
}

// Distance function of the rail track, where distance is the distance between boards
float sdCartTrack(vec3 ray_pos, int distance) {
    // Draw the wooden boards
    ray_pos = opRep(ray_pos, vec3(0., 0., distance));

    float board_distance = sdBox(ray_pos, vec3(2,0.1,0.4), 0.05);

    // Draw board rail connectors
    float connector_right_distance = sdBox(ray_pos - vec3(.85, .15, 0), vec3(.05), .0);
    float connector_left_distance = sdBox(ray_pos - vec3(-0.85, .15, 0), vec3(.05), .0);

    float connector_distance = opSharpUnion(connector_left_distance, connector_right_distance);

    // Combine connector with boards
    board_distance = opSharpUnion(board_distance, connector_distance);

    // Draw the rails with details
    float left_track = sdTrack(ray_pos - vec3(-1., 0.15, 0.));
    float right_track = sdTrack(ray_pos - vec3(1., 0.15, 0.));

    float track_distance = opSharpUnion(left_track, right_track);


    // Combine the rails and the board
    return opSharpUnion(board_distance, track_distance);
}

float sdCart(vec3 ray_pos) {
    return 1999;//sdCappedCylinder(opTx(ray_pos - path(uTime) - vec3(0.,-2.,8.), matRotZ(90)), 1., 1.);
}

float sdGround(vec3 ray_pos) {
    return sdPlaneY(ray_pos, 0.5*noise(ray_pos) -0.3);
}

float sdTunnel(vec3 ray_pos, float size) {
    float wall_distance = size - length(ray_pos.xy*vec2(1, 1)) + noise(ray_pos);

    float ground_distance = sdGround(ray_pos);

    wall_distance = opSmoothUnion(wall_distance, ground_distance,2 );

    // Draw the wooden beams
    float beam_distance = sdWoodBeams(opRep(ray_pos, vec3(0., 0., 3)), size);

    return opSharpUnion(wall_distance, beam_distance);
    //return opSmoothUnion(beam_distance, wall_distance, 0.05);
}

// *********
// Rendering
// *********

// Renderer based on https://github.com/electricsquare/raymarching-workshop

float map(vec3 pos){
    float tunnel_distance = sdTunnel(pos, 5);

    float track_distance = sdCartTrack(pos, 2);

    float scene_distance = opSharpUnion(tunnel_distance, track_distance);

    return min(scene_distance, sdCart(pos));
}

vec3 calcNormal(vec3 p){
    vec2 e = vec2(EPSILON, 0.);

    float d = map(p);

    vec3 gradient = d - vec3(
    map(p + e.xyy),
    map(p + e.yxy),
    map(p + e.yyx)
    );

    return normalize(gradient);
}


// trace ray using sphere tracing
float trace(vec3 ro, vec3 rd, out bool hit,out vec3 normal)
{
    const int maxSteps = 100;
    const float hitThreshold = 0.001;
    hit = false;
    float t = 0.;
    for(int i=0; i<maxSteps; i++)
    {
        vec3 pos = ro + t * rd;
        float d = map(pos);
	    
        if (d < hitThreshold) {
            hit = true;
            normal = calcNormal(pos);
            return t;
        }
        if(t > FAR_PLANE) break;

        t+= d;
    }
    return -1;
}

// Amanatides & Woo style voxel traversal
float voxelsize = 0.3; // in world space
//const vec3 voxelSize = vec3(0.2);

vec3 worldToVoxel(vec3 i)
{
    return floor(i/voxelsize);
}

vec3 voxelToWorld(vec3 i)
{
    return i*voxelsize;	
}

float maxVec(vec3 v) {
    return max(max(v.x,v.y),v.z);
}

float voxel_trace(vec3 ro, vec3 rd, out bool hit, out vec3 hitNormal,out int mat)
{
    int maxSteps = int(100/voxelsize);
    const float isoValue = 0.;

    vec3 voxel = worldToVoxel(ro);
    vec3 step = sign(rd);

    vec3 nearestVoxel = voxel + vec3(rd.x > 0.0, rd.y > 0.0, rd.z > 0.0);
    vec3 tMax = (voxelToWorld(nearestVoxel) - ro) / rd;
    vec3 tDelta = voxelsize / abs(rd);

    vec3 hitVoxel = voxel;
	
    hit = false;
    float hitT = 0.0;
    for(int i=0; i<maxSteps; i++) {
        float d = map(voxelToWorld(voxel));        
        if (d <= isoValue) {
            hit = true;
	    	hitVoxel = voxel;
            return hitT;
        }

        if (tMax.x < tMax.y && tMax.x < tMax.z) { 
            voxel.x += step.x;
            tMax.x += tDelta.x;
			
			hitNormal = vec3(-step.x, 0.0, 0.0);
            mat = 1;
			hitT = tMax.x;
        } else if (tMax.y < tMax.z) {
            voxel.y += step.y;
            tMax.y += tDelta.y;
			
			hitNormal = vec3(0.0, -step.y, 0.0);		
			hitT = tMax.y;
            mat = 2;
        } else {
            voxel.z += step.z;
            tMax.z += tDelta.z;
			
			hitNormal = vec3(0.0, 0.0, -step.z);		
			hitT = tMax.z;
            mat = 3;
        }   
    }
    mat = 0;
	return -1;
}

vec3 material(int mat) {
    if(mat == 1) {
        return vec3(1., 0.,0.);
    }
    if(mat == 2) {
        return vec3(0., 1.,0.);
    }
    if(mat == 3) {
        return vec3(0., 0.,1.);
    }
    return vec3(.8, .5, .21);;
}

vec3 render(vec3 ro, vec3 rd) {
    bool hit;
    vec3 nor;
    int mat;
    

#define VOXEL
#ifdef VOXEL
    float t = voxel_trace(ro, rd, hit, nor, mat);
    nor = -nor;
#else
    float t = trace(ro, rd, hit, nor);
#endif

    vec3 col = material(mat);
    if(hit) {
        vec3 pos = ro + t*rd;
        //return nor;
        col = col * max(dot(normalize(rd), nor), 0.);
    }

    //col = mix(col , vec3(.0, .0, .0), smoothstep(0., .95, t*2/FAR_PLANE));

    return col;
}

void main()
{
    vec2 pixel = (gl_FragCoord.xy / vec2(uRes.xy))*2.0-1.0;

    // compute ray origin and direction
    float asp = uRes.x / uRes.y;
    vec3 rd = normalize(vec3(asp*pixel.x, pixel.y, -2.0));
    vec3 ro = vec3(0.0, 2.0, 4.0 - uTime);
    ro += rd*2.0;
		
    //voxelsize = mix(0.05, 0.7, (sin(uTime) + 1) / 2.0);
    voxelsize = 0.1;

    vec3 rgb = render(ro, rd);

    frag_color=vec4(rgb, 1.0);
}