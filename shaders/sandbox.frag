#version 400 core
#define FAR_PLANE 20.
out vec4 frag_color;
uniform uvec2 uRes;
uniform float uTime;

const float PI = 3.14159;

float sdCircle(vec2 p, float r) {
    return length(p) - r;
}

vec2 cart2pol(vec2 p) {
    float l = length(p);
    float th = atan(p.x, p.y);
    return vec2(l,th);
}

void main()
{
    vec2 pos = (2.*gl_FragCoord.xy - uRes) / uRes.y;

    float d = sdCircle(pos, 0.4);
    vec3 col = pos.xxy;

    col = mix(vec3(1.0),vec3(0.0),smoothstep(0.0,0.003,abs(d)));

    frag_color = vec4(col, 1.0);
}