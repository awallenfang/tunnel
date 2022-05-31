#version 400 core
out vec4 frag_color;
const uint size = 80;

uniform uvec2 uRes;
uniform float uTime;
uniform vec3 uPositions[3*size];
uniform vec3 uCenter;
uniform uvec3 uFaces[size];

const vec3 uLight = vec3(1.2,0.9,-1.5);
const vec3 uColor = vec3(0.1f, 0.5f, 0.1f);

const float NEAR_VALUE = 0.1f;
const float FAR_VALUE = 100.f;


struct Geometry
{
    vec3 positions[3*size];
    vec3 center;
    uvec3 faces[size];
};


struct Plane {
    bool hit;
    uint face;
    float lambda;
    vec3 position;
    vec3 normal;
    vec3 color;
};


struct Ray{
    vec3 ori;
    vec3 dir;
};

Plane intersect_plane(Ray r,vec3 p0,vec3 p1,vec3 p2){
    Plane isect;
    isect.hit = false;
    vec3 c = p0;
    vec3 n = cross(p1 - p0, p2 - p0);
	float t = dot(n, c - r.ori) / dot(n,r.dir);

    if (t < NEAR_VALUE || t > FAR_VALUE) return isect;

    isect.hit = true;
    isect.lambda = t;
    isect.position = r.ori + t * r.dir;
    isect.normal = n;
    return isect;
}

bool edge_test(vec3 p0,vec3 p1, vec3 x, vec3 face_normal) {
    vec3 new_normal = cross(p1 - p0,x - p0);
	return dot(new_normal, face_normal) > 0;
}

Plane intersect_triangle(Geometry object, Ray r, uint face) {
    uint triangle_idx = face;
    uint i0 = object.faces[triangle_idx].x;
    uint i1 = object.faces[triangle_idx].y;
    uint i2 = object.faces[triangle_idx].z;
    vec3 p0 = object.positions[i0];
    vec3 p1 = object.positions[i1];
    vec3 p2 = object.positions[i2];

    Plane isect = intersect_plane(r, p0, p1, p2);
    if (!isect.hit) {
        return isect;
    }

    isect.hit = false;
    vec3 x = isect.position;
    vec3 n = isect.normal;

    // first line
    if (!edge_test(p0, p1, x, n) ||
        !edge_test(p1, p2, x, n) ||
        !edge_test(p2, p0, x, n)) {
        return isect;
    }

    isect.hit = true;

    float dArea = length(cross(p2 - p0,p1 - p0));
    float b0 = length(cross(p2 - x,p1 - x)) / dArea;
    float b1 = length(cross(p2 - p0,x - p0)) / dArea;
    float b2 = length(cross(x - p0,p1 - p0)) / dArea;

    isect.normal = b0 * normalize(object.positions[i0] - uCenter)
        + b1 * normalize(object.positions[i1] - uCenter)
        + b2 * normalize(object.positions[i2] - uCenter);

    // interpolate parameters
    float lum = max(dot(isect.normal, normalize(uLight - x)), 0.1f);
    isect.color = lum * b0 * uColor + lum * b1 * uColor + lum * b2 * uColor;

    return isect;
}


Plane intersect_scene(Geometry g, Ray r) {
    Plane isect;
    isect.lambda = 1000.f;
    Plane test_isect;
    for (uint f = 0; f < size; ++f) {
        test_isect.face = f;
        test_isect = intersect_triangle(g, r, test_isect.face);
        if (test_isect.hit) {
            if (test_isect.lambda < isect.lambda) {
                isect = test_isect;
            }
        } 
    }
    return isect;
}


void main() {
	vec2 pos = (gl_FragCoord.xy - vec2(uRes.xy) * .5) / float(uRes.y);
	vec3 color = vec3(0.15);
    Geometry g = Geometry(uPositions,uCenter,uFaces);

    mat3 rot = mat3(cos(uTime),0.,sin(uTime),
                    0.,1.,0.,
                    -sin(uTime),0.,cos(uTime));
					
    vec3 ori = rot * vec3(0,0,-3) ;
    vec3 dir = rot * normalize(vec3(pos.xy,1));
    Ray r = Ray(ori,dir);

    Plane i = intersect_scene(g,r);
    if (i.hit){
        color = i.color;
    }
	frag_color = vec4(color, 1.);
}