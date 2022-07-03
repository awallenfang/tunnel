#version 400 core

#define FAR_PLANE 100
#define MAX_RAYMARCHING_ITERATIONS 255
#define EPSILON 0.0001

#define PI 3.14159265359

out vec4 frag_color;
uniform uvec2 uRes;
uniform float uTime;

mat2 rot(float alpha) {
    vec2 a = sin(vec2(0.5 * PI, 0) + alpha);
    return mat2(a, -a.y, a.x);
}

/**
 * Signed distance function for a cube centered at the origin
 * with width = height = length = 2.0
 */
float cubeSDF(vec3 p) {
    // If d.x < 0, then -1 < p.x < 1, and same logic applies to p.y, p.z
    // So if all components of d are negative, then p is inside the unit cube
    vec3 d = abs(p) - vec3(1.0, 1.0, 1.0);

    // Assuming p is inside the cube, how far is it from the surface?
    // Result will be negative or zero.
    float insideDistance = min(max(d.x, max(d.y, d.z)), 0.0);

    // Assuming p is outside the cube, how far is it from the surface?
    // Result will be positive or zero.
    float outsideDistance = length(max(d, 0.0));

    return insideDistance + outsideDistance;
}

/**
 * Signed distance function for a sphere centered at the origin with radius 1.0;
 */
float sphereSDF(vec3 p) {
    return length(p) - 1.0;
}

float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float sdInfBox(vec2 p, vec2 b) {
    vec2 d = abs(p) - b;
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

/**
 * Signed distance function describing the scene.
 *
 * Absolute value of the return value indicates the distance to the surface.
 * Sign indicates whether the point is inside or outside the surface,
 * negative indicating inside.
 */
float map(vec3 p) {
    const float depth = 0.1;

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

    // The X-coordinate is now the radial coordinate, which radiates from the center
    // to infinity. We want to break it into cells that are 2 units wide, but centered
    // in the middle. The result is that the panels will start at radius one.
    //q.x = mod(q.x, 2.0) - 2.;
    // Plain old linear Z repetion. We want the panels and bolts to be repeated in the
    // Z-direction (down the tunnel) every half unit.
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

    // Lines and gaps on the tunnel to give the illusion of metal plating.

    float tunDetail = max(min(q.y - .06, q.z - .06), - min(q.y - .01, q.z - .01));

    // Adding the tunnel details (with a circular center taken out) to the tunnel.
    tun = min(tun, max(tunDetail, tun-depth));

    float result = min(tun, tun);
    result = min(result, blt);
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
float raymarch(vec3 ro, vec3 rd) {
    float depth = 0.;
    for (int i = 0; i < MAX_RAYMARCHING_ITERATIONS; i++) {
        float dist = map(ro + depth * rd);
        if (abs(dist) < EPSILON || depth > FAR_PLANE) {
            break;
        }
        depth += dist;
    }
    return min(depth, FAR_PLANE);
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
    map(vec3(p.x + EPSILON, p.y, p.z)) - map(vec3(p.x - EPSILON, p.y, p.z)),
    map(vec3(p.x, p.y + EPSILON, p.z)) - map(vec3(p.x, p.y - EPSILON, p.z)),
    map(vec3(p.x, p.y, p.z  + EPSILON)) - map(vec3(p.x, p.y, p.z - EPSILON))
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
vec3 phongContribForLight(vec3 k_d, vec3 k_s, float alpha, vec3 p, vec3 eye, vec3 lightPos, vec3 lightIntensity) {
    vec3 N = estimateNormal(p);
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
 * Lighting via Phong illumination.
 *
 * The vec3 returned is the RGB color of that point after lighting is applied.
 * k_a: Ambient color
 * k_d: Diffuse color
 * k_s: Specular color
 * alpha: Shininess coefficient
 * p: position of point being lit
 * eye: the position of the camera
 *
 * See https://en.wikipedia.org/wiki/Phong_reflection_model#Description
 */
vec3 phongIllumination(vec3 k_a, vec3 k_d, vec3 k_s, float alpha, vec3 p, vec3 eye) {
    const vec3 ambientLight = 0.5 * vec3(1.0, 1.0, 1.0);
    vec3 color = ambientLight * k_a;

    vec3 light1Pos = vec3(
    0.5 * sin(uTime),
    0.0,
    0.5 * cos(uTime));
    vec3 light1Intensity = vec3(0.4, 0.4, 0.4);

    color += phongContribForLight(k_d, k_s, alpha, p, eye, light1Pos, light1Intensity);

    vec3 light2Pos = vec3(
    2.0 * sin(0.37 * uTime),
    2.0 * cos(0.37 * uTime),
    2.0
    );
    vec3 light2Intensity = vec3(0.4, 0.4, 0.4);

    color += phongContribForLight(k_d, k_s, alpha, p, eye, light2Pos, light2Intensity);
    return color;
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

void main()
{
    vec3 ro = vec3(0, 0.0, 1.0);
    vec3 viewDir = rayDirection(45.0, uRes.xy, gl_FragCoord.xy);

    mat4 viewToWorld = viewMatrix(ro, vec3(0.0, 0.0, 0.0), vec3(.8, 1.0, 0.0));
    vec3 rd = (viewToWorld * vec4(viewDir, 0.0)).xyz;

    float dist = raymarch(ro, rd);

    if (dist > FAR_PLANE - EPSILON) {
        // Didn't hit anything
        frag_color = vec4(.4, .35, .3, 1.0);
        return;
    }

    // The closest point on the surface to the eyepoint along the view ray
    vec3 p = ro + dist * rd;

    vec3 K_a = vec3(0.2, 0.2, 0.2);
    vec3 K_d = vec3(0.7, 0.2, 0.2);
    vec3 K_s = vec3(1.0, 1.0, 1.0);
    float shininess = 10.0;

    vec3 color = phongIllumination(K_a, K_d, K_s, shininess, p, ro);

    frag_color = vec4(color, 1.0);
}