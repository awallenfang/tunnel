#version 330 core
layout (location = 0) in vec3 position;
layout (location = 1) in vec3 normal;
layout (location = 2) in vec4 color;

uniform mat4 model_mat;
uniform mat4 view_mat;
uniform mat4 proj_mat;
uniform uvec2 uRes;
uniform float uTime;
uniform uvec2 uPos[4];

out vec4 interp_color;
out vec3 interp_normal;  

float map(float value, float min1, float max1, float min2, float max2) {
  return min2 + (value - min1) * (max2 - min2) / (max1 - min1);
}

mat4 BuildTranslation(vec3 delta)
{
    mat4 m;
    m[0][0] = 1;
    m[1][1] = 1;
    m[2][2] = 1;
    m[3] = vec4(delta, 1.0);
    return m;
}

vec2 lerp(vec2 a, vec2 b, float t){
    return a + (b-a) * t;
}

vec2 quadbeziere(float t) {
    vec2 a = lerp(uPos[0],uPos[1],t);
    vec2 b = lerp(uPos[1],uPos[2],t);
    
    return lerp(a,b,t);
}

vec2 cubebeziere(float t) {
    vec2 a = lerp(uPos[0],uPos[1],t);
    vec2 b = lerp(uPos[1],uPos[2],t);
    vec2 c = lerp(uPos[2],uPos[3],t);

    vec2 d = lerp(a,b,t);
    vec2 e = lerp(b,c,t);
    
    return lerp(d,e,t);
}

void main()
{   
    float ar = float(uRes.x) / float(uRes.y);
    mat4 sca_mat = mat4(0);
    sca_mat[0][0] = sca_mat[1][1] = sca_mat[2][2] =  0.2;
    sca_mat[1][1] *= ar;
    sca_mat[3][3] = 1.;

    float t = (sin(uTime) + 1.0) / 2.;
    vec2 bez = cubebeziere(t);

    mat4 translation = BuildTranslation(vec3(map(bez.x, 0.,uRes.x,-1.,1.),map(bez.y, 0.,uRes.y,1.,-1.),0.));

    //gl_Position = sca_mat * proj_mat * view_mat * model_mat * vec4(position.x, position.y, position.z, 1.0);
    gl_Position = sca_mat * proj_mat * view_mat * model_mat * vec4(position.x, position.y, position.z, 1.0);
    gl_Position = translation * gl_Position;
    interp_color = color;
    interp_normal = normalize((transpose(inverse(model_mat)) * vec4(normal, 0.0)).xyz);
}
