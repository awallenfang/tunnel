#version 330 core
layout (location = 0) in vec3 position;
layout (location = 1) in vec3 normal;
layout (location = 2) in vec4 color;

uniform mat4 model_mat;
uniform mat4 view_mat;
uniform mat4 proj_mat;

out vec3 interp_normal;

void main()
{
    gl_Position = proj_mat * view_mat * model_mat * vec4(position.x, position.y, position.z, 1.0);
    interp_normal = normalize((transpose(inverse(model_mat)) * vec4(normal, 0.0)).xyz);
}
