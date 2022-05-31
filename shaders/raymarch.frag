// Derivative of  inigo quilez - iq/2019
// License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.

#version 400 core
#define FAR_PLANE 20.
out vec4 frag_color;
uniform uvec2 uRes;
uniform float uTime;

float sdEllipsoid(vec3 pos, vec3 rad){
    float k0 = length(pos/rad);
    float k1 = length(pos/rad/rad);
    return k0*(k0 - 1.0)/k1;
}

float sdBounce(vec3 pos){
    float t = fract(0.8*uTime);
    float y = 8.0*t*(1.0-t);
    vec3 cen = vec3(0., y, -1.);
    vec3 rad = vec3(.25, .25, .25);
    return sdEllipsoid(pos-cen, rad);
}

float map(vec3 pos){
    float d1 = sdBounce(pos);
    float d2 = pos.y - (-.25);

    return min(d1, d2);
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
        if ( t > FAR_PLANE) return -1.;
        if( d < eps) break;
        t += d;
    }
    return t;
}


void main()
{
    vec2 p = (2*gl_FragCoord.xy - vec2(uRes.xy)) / float(uRes.y);

    vec3 ro = vec3(0., 0.5, 2.);
    vec3 rd = normalize(vec3(p.xy, -2));

    vec3 col = vec3(0.4, .75, 1.);

    float t = ray(ro, rd);
    if (t > 0.){
        vec3 pos = ro + t*rd;
        vec3 nor = calcNormal(pos);

        vec3 sun_dir = normalize(vec3(.8, .4, .2));
        float sun_dif = clamp(dot(nor, sun_dir), 0., 1.);
        float sun_sh = step(ray(pos+nor*0.001, sun_dir), 0.0);
        sun_sh = 1.f;
        col = 0.18*vec3(7., 4.5, 3.)*sun_dif*sun_sh;
    }
    col = pow(col, vec3(0.4545));
    frag_color = vec4(col, 1.0);
}