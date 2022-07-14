#version 400 core

#define FAR_PLANE_DIST 100
#define MAX_RAYMARCHING_ITERATIONS 255
#define MAX_SOFT_SHADOW_ITERATIONS 32
#define EPSILON 0.0001

#define PI 3.14159265359

out vec4 frag_color;
uniform uvec2 uRes;
uniform float uTime;

struct Object {
    float distance;
    int objectId;
};

struct Material {
    vec3 K_a;
    vec3 K_d;
    vec3 K_s;
    float shininess;
};

const int WALL_ID = 0;
const Material WALL = Material(vec3(0.2), vec3(0.7, 0.2, 0.2), vec3(1.0, 1.0, 1.0), 30.0);

const int BOLT_ID = 1;
const Material BOLT = Material(vec3(.75, .75, .75), vec3(.8, .75, .6), vec3(1.0, 1.0, 1.0), 1000.0);

const int FAR_PLANE_ID = 2;

float n3D(vec3 p){

    const vec3 s = vec3(7, 157, 113);
    vec3 ip = floor(p); p -= ip;
    vec4 h = vec4(0., s.yz, s.y + s.z) + dot(ip, s);
    p = p*p*(3. - 2.*p); //p *= p*p*(p*(p * 6. - 15.) + 10.);
    h = mix(fract(sin(h)*43758.5453), fract(sin(h + s.x)*43758.5453), p.x);
    h.xy = mix(h.xz, h.yw, p.y);
    return mix(h.x, h.y, p.z); // Range: [0, 1].
}


Object objUnion(Object object1, Object object2) {
    if (object1.distance < object2.distance) {
        return object1;
    } else {
        return object2;
    }
}

mat2 rot(float alpha) {
    vec2 a = sin(vec2(0.5 * PI, 0) + alpha);
    return mat2(a, -a.y, a.x);
}

vec3 tunnelPath(float z) {
    return vec3(
    sin(z * PI / 32 + 0.5 * PI) * 2,
    cos(z * PI / 32) * sin(z * PI / 32 + 0.5 * PI),
    z
    );
}

/**
 * Signed distance function describing the scene.
 *
 * Absolute value of the return value indicates the distance to the surface.
 * Sign indicates whether the point is inside or outside the surface,
 * negative indicating inside.
 */
Object map(vec3 p) {
    const float depth = 0.1;

    p.xy -= tunnelPath(p.z).xy;

    // tunnel
    float tun = (1.0 + depth) - length(p.xy);
    float flr = p.y + .695;


    float a = atan(p.y, p.x)/(2 * PI);// Polar angle of "p.xy" coordinate.
    float ia = (floor(a*3.) + .7)/3. * 2 * PI;// Angle between "PI/6" intervals.
    float ia2 = (floor(a*18.) + .7)/18. * 2 * PI;// Angle between "PI/18" intervals.

    vec3 q = p;
    vec3 q2 = p;

    q.xy *= rot(ia + sign(mod(q.z + 0.7, 2.8) - 1.4) * PI/6);
    q2.xy *= rot(ia2);

    // Repeat panels and
    q.z = mod(q.z, 1.4) - 0.7;

    // Moving the bolts out to a distance of 2.1.
    q2.x = mod(q2.x, (2. + depth)) - (2. + depth)/2.;

    // Now, it's just a case of drawing an positioning some basic shapes. Boxes and
    // tubes with a hexagonal cross-section.
    q = abs(q);
    q2 = abs(q2);

    // Bolts. Hexagon shapes spaced out eighteen times around the tunnel walls. The
    // panels are spaced out in sixths, so that means three per panel.
    float blt = max(max(q2.x*.866025 + q2.y*.5, q2.y) - .02, q.z - .08);

    Object bltObj = Object(blt, BOLT_ID);

    // Lines and gaps on the tunnel to give the illusion of metal plating.

    float tunDetail = min(max(q.z - .06, q.z - .01), q.y - 0.01);

    // Adding the tunnel details (with a circular center taken out) to the tunnel.
    tun = min(tun, max(tunDetail, tun-depth));
    Object tunObj = Object(tun, WALL_ID);

    Object result = objUnion(tunObj, tunObj);
    result = objUnion(result, bltObj);

    return result;
}

/**
 * Return the shortest distance from the eyepoint to the scene surface along
 * the marching direction. If no part of the surface is found between start and end,
 * return end.
 *
 * eye: the eye point, acting as the origin of the ray
 * marchingDirection: the normalized direction to march in
 * start: the starting distance away from the eye
 * end: the max distance away from the ey to march before giving up
 */
Object raymarch(vec3 ro, vec3 rd) {
    float depth = 0.;
    int lastObjectId;
    for (int i = 0; i < MAX_RAYMARCHING_ITERATIONS; i++) {
        Object nearestObject = map(ro + depth * rd);
        float dist = nearestObject.distance;
        lastObjectId = nearestObject.objectId;

        if (abs(dist) < EPSILON || depth > FAR_PLANE_DIST) {
            break;
        }
        depth += dist;
    }

    if (FAR_PLANE_DIST < depth) {
        return Object(FAR_PLANE_DIST, FAR_PLANE_ID);
    }

    return Object(depth, lastObjectId);
}


/**
 * Return the normalized direction to march in from the eye point for a single pixel.
 *
 * fieldOfView: vertical field of view in degrees
 * size: resolution of the output image
 * fragCoord: the x,y coordinate of the pixel in the output image
 */
vec3 rayDirection(float fieldOfView, vec2 size, vec2 fragCoord) {
    vec2 xy = fragCoord - size / 2.0;
    float z = size.y / tan(radians(fieldOfView) / 2.0);
    return normalize(vec3(xy, -z));
}

/**
 * Using the gradient of the SDF, estimate the normal on the surface at point p.
 */
vec3 estimateNormal(vec3 p) {
    return normalize(vec3(
    map(vec3(p.x + EPSILON, p.y, p.z)).distance - map(vec3(p.x - EPSILON, p.y, p.z)).distance,
    map(vec3(p.x, p.y + EPSILON, p.z)).distance - map(vec3(p.x, p.y - EPSILON, p.z)).distance,
    map(vec3(p.x, p.y, p.z  + EPSILON)).distance - map(vec3(p.x, p.y, p.z - EPSILON)).distance
    ));
}

/**
 * Lighting contribution of a single point light source via Phong illumination.
 *
 * The vec3 returned is the RGB color of the light's contribution.
 *
 * k_a: Ambient color
 * k_d: Diffuse color
 * k_s: Specular color
 * alpha: Shininess coefficient
 * p: position of point being lit
 * eye: the position of the camera
 * lightPos: the position of the light
 * lightIntensity: color/intensity of the light
 *
 * See https://en.wikipedia.org/wiki/Phong_reflection_model#Description
 */
vec3 phongContribForLight(vec3 N, vec3 k_d, vec3 k_s, float alpha, vec3 p, vec3 eye, vec3 lightPos, vec3 lightIntensity) {
    vec3 L = normalize(lightPos - p);
    vec3 V = normalize(eye - p);
    vec3 R = normalize(reflect(-L, N));

    float dotLN = dot(L, N);
    float dotRV = dot(R, V);

    if (dotLN < 0.0) {
        // Light not visible from this point on the surface
        return vec3(0.0, 0.0, 0.0);
    }

    if (dotRV < 0.0) {
        // Light reflection in opposite direction as viewer, apply only diffuse
        // component
        return lightIntensity * (k_d * dotLN);
    }
    return lightIntensity * (k_d * dotLN + k_s * pow(dotRV, alpha));
}

/**
 * Return a transform matrix that will transform a ray from view space
 * to world coordinates, given the eye point, the camera target, and an up vector.
 *
 * This assumes that the center of the camera is aligned with the negative z axis in
 * view space when calculating the ray marching direction. See rayDirection.
 */
mat4 viewMatrix(vec3 eye, vec3 center, vec3 up) {
    // Based on gluLookAt man page
    vec3 f = normalize(center - eye);
    vec3 s = normalize(cross(f, up));
    vec3 u = cross(s, f);
    return mat4(
    vec4(s, 0.0),
    vec4(u, 0.0),
    vec4(-f, 0.0),
    vec4(0.0, 0.0, 0.0, 1)
    );
}

float calcSoftShadow(vec3 ro, vec3 lightPos) {
    const float k = 10.0;
    float maxDistance = max(length(lightPos - ro), 0.01);

    float shade = 1.0;
    float t = 0.05;

    vec3 rd = normalize(lightPos - ro);
    for (int i = 0; i < MAX_SOFT_SHADOW_ITERATIONS; i ++) {
        float h = map(ro + rd * t).distance;
        shade = min(shade, k * h / t);
        t += h;

        if (shade < 0.01 || t > maxDistance) break;
    }

    return clamp(shade + 0.2, 0.0, 1.0);
}

float calcAmbientOcclusion(vec3 p, vec3 n)
{
    float occ = 0.0;
    float sca = 1.0;
    for (float i=0; i<5; i++) {
        float h = 0.001 + 0.15 * i / 4.0;
        float d = map(p + h*n).distance;
        occ += (h - d) * sca;
        sca *= 0.95;
    }
    return clamp(1.0 - 1.5*occ, 0.0, 1.0);
}

Material getMaterial(int objectId) {
    if (objectId == WALL_ID) {
        return WALL;
    }

    if (objectId == BOLT_ID) {
        return BOLT;
    }

    return Material(vec3(0), vec3(0), vec3(0), 0.0);
}

float calculateBumpMap(vec3 p) {
    p.xy -= tunnelPath(p.z).xy;
    float res = n3D(p * 13.0) * 0.01;
    return res;
}

vec3 applyBumpMap(vec3 p, vec3 normal, float bumpFactor) {
    const vec2 e = vec2(EPSILON, 0);

    float bumpMapValue = calculateBumpMap(p);
    vec3 gradient = vec3(calculateBumpMap(p - e.xyy), calculateBumpMap(p - e.yxy), calculateBumpMap(p - e.yyx)) - bumpMapValue;
    gradient /= e.x;

    gradient -= normal * dot(normal, gradient);

    return normalize(normal + gradient);
}

void main() {
    const float speed = 1.0;

    vec3 ro = tunnelPath(uTime * speed);
    vec3 viewDir = rayDirection(45.0, uRes.xy, gl_FragCoord.xy);

    mat4 viewToWorld = viewMatrix(ro, tunnelPath(uTime * speed + 3.0), vec3(.8, 1.0, 0.0));
    vec3 rd = (viewToWorld * vec4(viewDir, 0.0)).xyz;

    Object hitObject = raymarch(ro, rd);

    if (hitObject.objectId == FAR_PLANE_ID) {
        // Didn't hit anything
        frag_color = vec4(.4, .35, .3, 1.0);
        return;
    }

    // The closest point on the surface to the eyepoint along the view ray
    vec3 p = ro + hitObject.distance * rd;

    Material material = getMaterial(hitObject.objectId);

    const vec3 ambientLight = 0.8 * vec3(1.0, 1.0, 1.0);
    vec3 color = ambientLight * material.K_a;

    vec3 lightPos = tunnelPath(uTime * speed) - vec3(0, 0, 1.0);
    vec3 lightIntensity = vec3(0.4, 0.4, 0.4);

    vec3 normal = estimateNormal(p);
    if (hitObject.objectId == WALL_ID || hitObject.objectId == BOLT_ID) {
        const float bumpFactor = 0.02;
        normal = applyBumpMap(p, normal, bumpFactor / (1 + hitObject.distance / FAR_PLANE_DIST));
    }

    float shadow = calcSoftShadow(p, lightPos);
    float ao = calcAmbientOcclusion(p, normal);

    lightPos -= p;
    float lightDistance = max(length(lightPos), EPSILON);
    lightPos /= lightDistance;

    color += phongContribForLight(normal, material.K_d, material.K_s, material.shininess, p, ro, lightPos, lightIntensity);
    color *= shadow;
    color *= ao;

    frag_color = vec4(color, 1.0);
}