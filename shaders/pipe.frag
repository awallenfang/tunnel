#version 400 core

#define FAR_PLANE_DIST 255
#define MAX_RAYMARCHING_ITERATIONS 255
#define MAX_SOFT_SHADOW_ITERATIONS 32
#define EPSILON 0.0001

#define PI 3.14159265359

out vec4 frag_color;
uniform uvec2 uRes;
uniform float uTime;
uniform sampler2D tex;

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
const Material WALL = Material(vec3(0.6), vec3(0.7, 0.2, 0.2), vec3(1.0, 1.0, 1.0), 30.0);

const int BOLT_ID = 1;
const Material BOLT = Material(vec3(.75, .75, .75), vec3(.8, .75, .6), vec3(1.0, 1.0, 1.0), 1000.0);

const int FAR_PLANE_ID = 2;

float randomFromPoint(vec3 p){
    // pseudo random float in range [0,1] with "seed" p
    const vec3 s = vec3(7, 157, 113);
    vec3 ip = floor(p); p -= ip;
    vec4 h = vec4(0., s.yz, s.y + s.z) + dot(ip, s);
    p = p*p*(3. - 2.*p);
    h = mix(fract(sin(h)*43758.5453), fract(sin(h + s.x)*43758.5453), p.x);
    h.xy = mix(h.xz, h.yw, p.y);
    return mix(h.x, h.y, p.z);
}

vec3 lookup3DTexture(sampler2D channel, vec3 p, vec3 n){
    n = max(abs(n) - .2, 0.001);
    n /= dot(n, vec3(1));
    vec3 tx = texture(channel, p.yz).xyz;
    vec3 ty = texture(channel, p.xz).xyz;
    vec3 tz = texture(channel, p.xy).xyz;
    return tx*tx*n.x + ty*ty*n.y + tz*tz*n.z;
}

Object objUnion(Object object1, Object object2) {
    if (object1.distance < object2.distance) {
        return object1;
    } else {
        return object2;
    }
}

mat2 rot(float alpha) {
    return mat2(
    cos(alpha), sin(alpha),
    -sin(alpha), cos(alpha)
    );
}

vec3 tunnelPath(float z) {
    return vec3(
    sin(z * PI / 32 + 0.5 * PI) * 2,
    cos(z * PI / 32) * sin(z * PI / 32 + 0.5 * PI),
    z
    );
}


Object map(vec3 p) {
    const float depth = 0.1;

    p.xy -= tunnelPath(p.z).xy;

    // tunnel wall
    float tun = (1.0 + depth) - length(p.xy);

    float alpha = atan(p.y, p.x) / (2 * PI);
    float ia = (floor(alpha * 3.) + .7) / 3. * 2 * PI; // angle used for platting details.
    float ia2 = (floor(alpha * 18.) + .7) / 18. * 2 * PI; // angle used for bolds

    vec3 q = p;
    vec3 q2 = p;

    q.xy *= rot(ia + sign(mod(q.z + 0.7, 2.8) - 1.4) * PI/6);
    q2.xy *= rot(ia2);

    // Repeat along z
    q.z = mod(q.z, 1.4) - 0.7;

    // Centering the bolts on the side
    q2.x = mod(q2.x, (2. + depth)) - (2. + depth)/2.;

    // only want positive values
    q = abs(q);
    q2 = abs(q2);

    // bolts
    float blt = max(max(q2.x*.866025 + q2.y*.5, q2.y) - .02, q.z - .08);

    Object bltObj = Object(blt, BOLT_ID);

    // metal platting on the walls
    float tunDetail = min(max(q.z - .06, q.z - .01), q.y - 0.01);

    // detail without the center
    tun = min(tun, max(tunDetail, tun-depth));
    Object tunObj = Object(tun, WALL_ID);

    Object result = objUnion(tunObj, tunObj);
    result = objUnion(result, bltObj);

    return result;
}

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


vec3 rayDirection(float fieldOfView, vec2 size, vec2 fragCoord) {
    vec2 xy = fragCoord - size / 2.0;
    float z = size.y / tan(radians(fieldOfView) / 2.0);
    return normalize(vec3(xy, -z));
}

/**
 * Using the gradient of the SDF, estimate the normal on the surface at point p.
 */
vec3 estimateNormal(vec3 p) {
    const float eps = 0.001;

    return normalize(vec3(
    map(vec3(p.x + eps, p.y, p.z)).distance - map(vec3(p.x - eps, p.y, p.z)).distance,
    map(vec3(p.x, p.y + eps, p.z)).distance - map(vec3(p.x, p.y - eps, p.z)).distance,
    map(vec3(p.x, p.y, p.z  + eps)).distance - map(vec3(p.x, p.y, p.z - eps)).distance
    ));
}

/**
 * See https://en.wikipedia.org/wiki/Phong_reflection_model#Description
 */
vec3 phongLighting(vec3 N, vec3 k_d, vec3 k_s, float alpha, vec3 p, vec3 eye, vec3 lightPos, vec3 lightIntensity) {
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

mat4 viewMatrix(vec3 eye, vec3 center, vec3 up) {
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
    return randomFromPoint(p * 13.0) * 0.01;
}

vec3 applyBumpMap(vec3 p, vec3 normal, float bumpFactor) {
    const vec2 e = vec2(0.01, 0);

    float bumpMapValue = calculateBumpMap(p);
    vec3 gradient = vec3(calculateBumpMap(p - e.xyy), calculateBumpMap(p - e.yxy), calculateBumpMap(p - e.yyx)) - bumpMapValue;
    gradient /= e.x;

    gradient -= normal * dot(normal, gradient);

    return normalize(normal + gradient * bumpFactor);
}

float rgb2Gray(vec3 rgb) {
    return dot(rgb, vec3(0.299, 0.587, 0.114));
}

float calculateTextureBumpMap(sampler2D sampler, vec3 p, vec3 normal) {
    return rgb2Gray(lookup3DTexture(sampler, p, normal));
}

vec3 applyTextureBumpMap(sampler2D sampler, vec3 normal, vec3 p, float bumpFactor){
    const vec2 e = vec2(0.01, 0);

    float bumpMapValue = calculateTextureBumpMap(sampler, p, normal);

    // Three gradient vectors rolled into a matrix, constructed with offset greyscale texture values.
    vec3 gradient = vec3(
        calculateTextureBumpMap(sampler, p - e.xyy, normal),
        calculateTextureBumpMap(sampler, p - e.yxy, normal),
        calculateTextureBumpMap(sampler, p - e.yyx, normal)
    ) - bumpMapValue;
    gradient /= e.x;

    gradient -= normal * dot(normal, gradient);
    return normalize(normal + gradient * bumpFactor);
}

void main() {
    const float speed = 3.0;

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

    const float bumpFactor = 0.02;
    normal = applyBumpMap(p, normal, bumpFactor / (1 + hitObject.distance / FAR_PLANE_DIST));

    const float textureSize = 0.6;
    vec3 tx = lookup3DTexture(tex, p * textureSize, normal);
    color *= smoothstep(0., .5, tx);

    const float textureBumpFactor = 0.1;
    normal = applyTextureBumpMap(tex, normal, p * textureSize * 2, textureBumpFactor);

    float shadow = calcSoftShadow(p, lightPos);
    float ao = calcAmbientOcclusion(p, normal);

    lightPos -= p;
    float lightDistance = max(length(lightPos), EPSILON);
    lightPos /= lightDistance;

    color += phongLighting(normal, material.K_d, material.K_s, material.shininess, p, ro, lightPos, lightIntensity);
    color *= shadow;
    color *= ao;

    frag_color = vec4(color, 1.0);
}