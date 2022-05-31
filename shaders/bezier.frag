#version 330 core

in vec4 interp_color;
in vec3 interp_normal;
uniform vec3 light_dir;

out vec4 frag_color;

void main()
{
    float light = dot(interp_normal, light_dir);
    frag_color = clamp(light, 0.1, 1.0) * interp_color;
}
