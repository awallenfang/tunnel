#version 400 core
#define FAR_PLANE 50.
#define EPSILON 0.001
#define PI 3.14159265

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

struct Object {
    float dist;
    int material;
};

vec3 path2(float z){ 
    //return vec2(0); // Straight.
    float a = sin(z * 0.11);// 0.11
    float b = cos(z * 0.14); // 0.14
    
    float x = a*4. -b*1.5;
    float y = b*4 + a*1.5;
    y = 0.;
    return vec3(x, y, z); 
}

Object opSharpUnion(Object ob1, Object ob2) {
    if(ob1.dist < ob2.dist) return ob1;
    return ob2;
}

Object sdSphere(vec3 pos, vec3 center, float radius, int mat) {
    return Object(length(pos - center) - radius,0);
}

Object sdPlaneWave(vec3 pos, vec4 normal, int mat) {
    return Object(dot(pos, normal.xyz) + normal.w + sin(pos.z + uTime*10)/3 * noise(pos + uTime/10.) - cos(pos.x*2)/3 * noise(pos), mat);
}

vec3 campos;

Object map(vec3 pos) {
    float size = 5;
    vec2 p = -path2(pos.z).xy + pos.xy*vec2(1, 1);
    Object wall_distance = Object(size - length(p) + noise(pos),1);
    Object planeDist = sdPlaneWave(pos, vec4(0,1., 0, 3.5), 2);

    //float spheredist = sdSphere(pos, path2(campos.z - 5.), 1.);
    //if(spheredist < wall_distance) mat = 2;
    //return opSharpUnion(wall_distance,spheredist);

    return opSharpUnion(wall_distance,planeDist);
}

int s = 1;

Object scene(vec3 pos) {
    return map(pos);
}

vec3 calcNormal(vec3 p){
    vec2 e = vec2(EPSILON, 0.);

    float d = scene(p).dist;

    vec3 gradient = d - vec3(
    scene(p + e.xyy).dist,
    scene(p + e.yxy).dist,
    scene(p + e.yyx).dist
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
        Object d = scene(pos);
	    
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

float voxelsize = 0.4; 

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

Object voxel_trace(vec3 ro, vec3 rd, out bool hit, out vec3 hitNormal)
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
        Object d = scene(voxelToWorld(voxel));        
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
    return vec3(.8, .5, .21);
}

vec3 render(vec3 ro, vec3 rd) {
    bool hit;
    vec3 nor;
    
#define VOXEL
#ifdef VOXEL
    Object t = voxel_trace(ro, rd, hit, nor);
    nor = -nor;
#else
    Object t = trace(ro, rd, hit, nor);
#endif
    
    vec3 col = material(t.material);
    if(hit) {
        vec3 pos = ro + t.dist*rd;
        //return nor;
        col = col * max(dot(normalize(rd), nor), 0.);
    }

    //col = mix(col , vec3(.0, .0, .0), smoothstep(0., .95, t*2/FAR_PLANE));

    return col;
}

void main()
{
    vec2 uv = (gl_FragCoord.xy / vec2(uRes.xy))*2.0-1.0;

    // compute ray origin and direction
    float asp = uRes.x / uRes.y;
    
    float z = -uTime * 5.;
    vec3 ro = path2(z);
    //if(ro.y < 0) ro.y *= 0.8;
    vec3 prev = path2((z+1));
    vec3 lookdir = normalize(ro-prev);
    vec3 move = lookdir - vec3(0.,0.,-1.);
    vec2 uvmod = uv + move.xy;
    campos = ro;

    vec3 rd = normalize(vec3(asp*uvmod.x, uvmod.y, lookdir.z));
    //rd = normalize(vec3(asp*uv.x,uv.y,-2.));
    ro += rd*2.0;
		
    //voxelsize = mix(0.05, 0.75, (sin(uTime) + 1) / 2.0);

    vec3 rgb = render(ro, rd);

    frag_color=vec4(rgb, 1.0);
}