#version 330 core

in vec3 interp_normal;
out vec4 frag_color;

void main()
{
    frag_color = vec4(0.5 * (normalize(interp_normal) + 1.0), gl_FragCoord.z);
}
