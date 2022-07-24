#version 400 core
layout (location = 0) in vec3 position;

uniform float x0;
uniform float x1;
uniform float y0;
uniform float y1;

void main()
{
    gl_Position = vec4(((position.xy * 0.5 + 0.5) * vec2(x1 - x0, y1 - y0) + vec2(x0, y0)) * 2.0 - 1.0, position.z, 1.0);
}