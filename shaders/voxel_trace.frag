#version 400 core
#define FAR_PLANE 50.
#define EPSILON 0.001
#define PI 3.14159265

out vec4 frag_color;

uniform uvec2 uRes;
uniform float uTime;

// noise function by https://gist.github.com/patriciogonzalezvivo/670c22f3966e662d2f83

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
}

// struct representing hit
struct Object {
    float dist;
    int material;
};

struct Config {
    float voxelsize;
    int scene;
};

// path of tunnel and view through tunnel
vec3 path(float z){ 
    float a = sin(z * 0.11);
    float b = cos(z * 0.14);
    
    float x = a*4. -b*1.5;
    float y = b*4 + a*1.5;
    y = 0.;
    return vec3(x, y, z); 
}

/********************
*   opertations     *
*********************/


Object opSharpUnion(Object ob1, Object ob2) {
    if(ob1.dist < ob2.dist) return ob1;
    return ob2;
}

/****************
*   Tunnel      *
*****************/

// sdf: sphere
Object sdSphere(vec3 pos, vec3 center, float radius, int mat) {
    return Object(length(pos - center) - radius,0);
}

// sdf: water
Object sdPlaneWave(vec3 pos, vec4 normal, int mat) {
    vec3 p = path(pos.z);
    vec3 dir = normalize(path(pos.z) - path(pos.z-1));
    float water_speed = 3;
    
    float dist = dot(pos, normal.xyz) + normal.w 
                + sin(pos.z + uTime*water_speed)/2 * noise(pos + uTime/10.) 
                - sin(((pos.x - p.x) * 0.3 * dir).x)/1 * noise(pos);
    return Object(dist, mat);
}

// sdf: Hollow Sphere: https://iquilezles.org/articles/distfunctions/
float sdCutHollowSphere( vec3 p, float r, float h, float t )
{
  // sampling independent computations (only depend on shape)
  float w = sqrt(r*r-h*h);
  
  // sampling dependant computations
  vec2 q = vec2( length(p.xz), p.y );
  return ((h*q.x<w*q.y) ? length(q-vec2(w,h)) : 
                          abs(length(q)-r) ) - t;
}



Object sdBoat(vec3 p, vec3 position) {
   p -= position;
   float h = 0.5;
   float sphereDist = sdCutHollowSphere(p, 2.,h,0.2);
   return Object(sphereDist, 4);
}

//#define GITTERBOAT

//sdf: complete Tunnel
Object map(vec3 pos) {
    float size = 5;
    vec2 p = -path(pos.z).xy + pos.xy*vec2(1, 1);
    Object wall_distance = Object(size - length(p) + noise(pos),1);
    Object planeDist = sdPlaneWave(pos, vec4(0,1., 0, 3.5), 2);

#ifdef GITTERBOAT
    vec3 boatPos = path(-uTime * 7.-1);
    boatPos.y -= 3.3;
    Object boat = sdBoat(pos, boatPos);
    Object other = opSharpUnion(boat, planeDist);
    
    return opSharpUnion(wall_distance,other);
#else
    return opSharpUnion(wall_distance,planeDist);
#endif
}

Object scene(vec3 pos, int scene) {
    switch(scene){
        case 0: return map(pos);
        case 1: return sdBoat(pos, vec3(0.,-3.3,-.2));
    };
    return map(pos);
}

/***************************
*   Sphere Raymarching     *
****************************/

vec3 calcNormal(vec3 p){
    vec2 e = vec2(EPSILON, 0.);

    float d = scene(p,0).dist;

    vec3 gradient = d - vec3(
    scene(p + e.xyy,0).dist,
    scene(p + e.yxy,0).dist,
    scene(p + e.yyx,0).dist
    );

    return normalize(gradient);
}

// trace ray using sphere tracing
Object trace(vec3 ro, vec3 rd, out bool hit,out vec3 normal)
{
    const int maxSteps = 100;
    const float hitThreshold = 0.001;
    hit = false;
    float t = 0.;
    for(int i=0; i<maxSteps; i++)
    {
        vec3 pos = ro + t * rd;
        Object d = scene(pos,0);
	    
        if (d.dist < hitThreshold) {
            hit = true;
            normal = calcNormal(pos);
            return Object(t, d.material);
        }
        if(t > FAR_PLANE) break;

        t+= d.dist;
    }
    return Object(-1,0);
}

/***************************
*   Voxel Raymarching      *
****************************/


vec3 worldToVoxel(vec3 i, float voxelsize)
{
    return floor(i/voxelsize);
}

vec3 voxelToWorld(vec3 i, float voxelsize)
{
    return i*voxelsize;	
}

float maxVec(vec3 v) {
    return max(max(v.x,v.y),v.z);
}

Object voxel_trace(vec3 ro, vec3 rd, out bool hit, out vec3 hitNormal, Config conf)
{
    float voxelsize = conf.voxelsize;
    int maxSteps = int(100/voxelsize);
    const float isoValue = 0.;

    vec3 voxel = worldToVoxel(ro, voxelsize);
    vec3 step = sign(rd);

    vec3 nearestVoxel = voxel + vec3(rd.x > 0.0, rd.y > 0.0, rd.z > 0.0);
    vec3 tMax = (voxelToWorld(nearestVoxel, voxelsize) - ro) / rd;
    vec3 tDelta = voxelsize / abs(rd);

    vec3 hitVoxel = voxel;
	
    hit = false;
    float hitT = 0.0;
    for(int i=0; i<maxSteps; i++) {
        Object d = scene(voxelToWorld(voxel, voxelsize), conf.scene);        
        if (d.dist <= isoValue) {
            hit = true;
	    	hitVoxel = voxel;
            return Object(hitT, d.material);
        }

        if (tMax.x < tMax.y && tMax.x < tMax.z) { 
            voxel.x += step.x;
            tMax.x += tDelta.x;
			
			hitNormal = vec3(-step.x, 0.0, 0.0);
			hitT = tMax.x;
        } else if (tMax.y < tMax.z) {
            voxel.y += step.y;
            tMax.y += tDelta.y;
			
			hitNormal = vec3(0.0, -step.y, 0.0);		
			hitT = tMax.y;
        } else {
            voxel.z += step.z;
            tMax.z += tDelta.z;
			
			hitNormal = vec3(0.0, 0.0, -step.z);		
			hitT = tMax.z;
        }   
    }
	return Object(-1, 0);
}

/***********
*   Main   *
************/

// convert material index into color
vec3 material(int mat) {
    if(mat == 1) {
        return vec3(0.5, 0.5, 0.5);
    }
    if(mat == 2) {
        return vec3(0., 0., 0.5);
    }
    if(mat == 3) {
        return vec3(0., 0.,1.);
    }
    if(mat == 4) {
        return vec3(153/255., 71/255., 16/255.);
    }
    return vec3(.0, .0, .0);
}

mat3 rot;
mat3 rotZ;

#define VOXEL
vec3 render(vec3 ro, vec3 rd, float voxelsize) {
    bool hit;
    vec3 nor;
    
#ifdef VOXEL
    Object t = voxel_trace(ro, rd, hit, nor, Config(voxelsize,0));
    nor = -nor;

#ifndef GITTERBOAT
    bool hit2;
    vec3 nor2;

    Object boat = voxel_trace(vec3(0.), rot * rd, hit2, nor2, Config(voxelsize, 1));
    if(hit2) {
        hit = hit2;
        nor = -nor2;
        t = boat;
    }
#endif

#else
    Object t = trace(ro, rd, hit, nor);
#endif
    
    vec3 col = material(t.material);
    if(hit) {
        col = col * max(dot(normalize(rd), nor), 0.);
    }

    col = mix(col , vec3(.0, .0, .0), smoothstep(.5, .95, t.dist*2/FAR_PLANE));

    return col;
}

void main()
{
    vec2 uv = (gl_FragCoord.xy / vec2(uRes.xy))*2.0-1.0;

    // compute ray origin and direction
    float asp = uRes.x / uRes.y;
    
    float z = -uTime * 7.;
    vec3 ro = path(z);
    ro.y -= 1;
    
    vec3 prev = path((z+1));
    vec3 lookdir = normalize(ro-prev);
    //lookdir.y += sin(uTime*4)/10.;
    //lookdir.y += 0.3;
    vec3 move = lookdir - vec3(0.,0.,-1.);
    vec2 uvmod = uv + move.xy;

    vec3 rd = normalize(vec3(asp*uvmod.x, uvmod.y, lookdir.z));
    
    ro += rd*2.0;

    float angle = acos(dot(normalize(vec2(0,-1)), normalize(lookdir.xz))) / 5.;
    if(lookdir.x < 0) angle = -angle;
    rot = mat3(
        cos(angle), 0, -sin(angle),
        0, 1, 0,
        sin(angle), 0, cos(angle)
    );

    rot *= mat3(
        1, 0, 0,
        0, cos(angle), -sin(angle),
        0, sin(angle), cos(angle)
    );


#ifdef VOXEL
    float voxelsize = 0.25; 
#else
    float voxelsize = 0.;
#endif

    vec3 rgb = render(ro, rd, voxelsize);

    frag_color=vec4(rgb, 1.0);
}