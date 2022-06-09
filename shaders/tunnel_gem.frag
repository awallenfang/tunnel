#version 400 core
#define FAR_PLANE 100.
out vec4 frag_color;
uniform uvec2 uRes;
uniform float uTime;

// Source https://gist.github.com/patriciogonzalezvivo/670c22f3966e662d2f83
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

// A mod(float, int) without weird precision loss on the float
float modulo(float n, int val) {
    return (int(n) % val) + fract(n);
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

// An infinite horizontal plane
float sdPlaneY(vec3 pos, float offset) {
    return pos.y + offset;
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
    float connector_left_distance = sdBox(ray_pos - vec3(.85, .15, .25), vec3(.05), .0);
    float connector_right_distance = sdBox(ray_pos - vec3(-0.85, .15, .25), vec3(.05), .0);

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

float sdGround(vec3 ray_pos) {
    return sdPlaneY(ray_pos, 0.5*noise(ray_pos) - 0.2);
}

float sdTunnel(vec3 ray_pos, float size) {
    float wall_distance = size - length(ray_pos.xy*vec2(1, 1)) + noise(ray_pos);

    float ground_distance = sdGround(ray_pos);

    wall_distance = opSmoothUnion(wall_distance, ground_distance,2 );

    // Draw the wooden beams
    float beam_distance = sdWoodBeams(opRep(ray_pos, vec3(0., 0., 3)), size);

    return min(wall_distance, beam_distance);
    //return opSmoothUnion(beam_distance, wall_distance, 0.05);
}


float map(vec3 pos){
    float tunnel_distance = sdTunnel(pos, 5);

    float track_distance = sdCartTrack(pos, 2);

    float scene_distance = opSharpUnion(tunnel_distance, track_distance);

    return scene_distance;
}

// The path the camera takes, ran over using t
vec3 path(float t) {
    return vec3(0., 2., -10*t);
}

vec3 calcNormal(vec3 p){
    vec2 e = vec2(0.001, 0.);

    float d = map(p);

    vec3 gradient = d - vec3(
    map(p + e.xyy),
    map(p + e.yxy),
    map(p + e.yyx)
    );

    return normalize(gradient);
}

float ray(vec3 ro, vec3 rd){
    float t = 0.;
    float eps = 0.001;
    uint steps = 100;
    for (int i=0; i<steps; i++) {
        vec3 pos = ro + t*rd;
        float d = map(pos);
        if ( t > FAR_PLANE) return FAR_PLANE;
        if( d < eps) break;
        t += d;
    }
    return t;
}

vec3 render(vec3 ro, vec3 rd) {

    vec3 col = vec3(0.4, .75, 1.);

    float t = ray(ro, rd);
    if (t > 0.){
        vec3 pos = ro + t*rd;
        vec3 nor = calcNormal(pos);

        // vec3 sun_dir = normalize(vec3(.8, .4, .2));
        // float sun_dif = clamp(dot(nor, sun_dir), 0., 1.);
        // float sun_sh = step(ray(pos+nor*0.001, sun_dir), 0.0);
        // float sun_sh = 1.f;
        col = col * dot(normalize(rd), nor);
    }
    col = mix(col , vec3(.08, .16, .34), smoothstep(0., .95, t*2/FAR_PLANE));
    return col;
}

void main()
{
    vec2 p = (2*gl_FragCoord.xy - vec2(uRes.xy)) / float(uRes.y);

    vec3 ro = path(uTime);
    vec3 rd = normalize(vec3(p.xy, -1.));

    vec3 col = render(ro, rd);
    
    frag_color = vec4(col, 1.0);
}