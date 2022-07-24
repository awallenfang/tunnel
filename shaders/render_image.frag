#version 450 core
in vec2 uv;

out vec4 frag_color;

uniform sampler2D image;
uniform int sample_num;
uniform int samples;

uniform float x0;
uniform float x1;
uniform float y0;
uniform float y1;


vec3 aces(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
    if (gl_FragCoord.x < x0 + 1.1 && gl_FragCoord.x > x0 - 1.6 && gl_FragCoord.y < y0 + 30.1 && gl_FragCoord.y > y0 - 1.6 || 
        gl_FragCoord.x < x0 + 1.1 && gl_FragCoord.x > x0 - 1.6 && gl_FragCoord.y > y1 - 30.1 && gl_FragCoord.y < y1 + 1.6 || 
        gl_FragCoord.x > x1 - 1.1 && gl_FragCoord.x < x1 + 1.6 && gl_FragCoord.y > y1 - 30.1 && gl_FragCoord.y < y1 + 1.6 || 
        gl_FragCoord.x > x1 - 1.1 && gl_FragCoord.x < x1 + 1.6 && gl_FragCoord.y < y0 + 30.1 && gl_FragCoord.y > y0 - 1.6 || 
        gl_FragCoord.y < y0 + 1.1 && gl_FragCoord.y > y0 - 1.6 && gl_FragCoord.x < x0 + 30.1 && gl_FragCoord.x > x0 - 1.6 || 
        gl_FragCoord.y < y0 + 1.1 && gl_FragCoord.y > y0 - 1.6 && gl_FragCoord.x > x1 - 30.1 && gl_FragCoord.x < x1 + 1.6 || 
        gl_FragCoord.y > y1 - 1.1 && gl_FragCoord.y < y1 + 1.6 && gl_FragCoord.x > x1 - 30.1 && gl_FragCoord.x < x1 + 1.6 || 
        gl_FragCoord.y > y1 - 1.1 && gl_FragCoord.y < y1 + 1.6 && gl_FragCoord.x < x0 + 30.1 && gl_FragCoord.x > x0 - 1.6) {

        frag_color = vec4(1.0, 0.6, 0.0, 1.0);
        return;
    }
    const float gamma = 2.2;
    vec4 tex = texture(image, uv);
    vec3 color = tex.rgb / tex.w;
    //color = aces(color);
    vec3 result = vec3(1.0) - exp(-(color) * 1.2);
    //vec3 result = color;
    result = pow(aces(color), vec3(1.0 / gamma));
    frag_color = vec4(result, 1.0);
}