#version 330 core
layout (location = 0) in vec3 position;

out vec2 interp_uv;
out vec3 eye_direction;
out vec3 local_light_pos;

uniform mat4 view_mat;
uniform vec2 half_size_near;
uniform vec3 light_pos;

void main()
{
	gl_Position  = vec4(position.xyz, 1.0);
	interp_uv = clamp(0.5 * (position.xy + 1.0), 0.0, 1.0);

    // TASK:
    // Compute eye_direction (d_eye in the lesson) using half_size_near
    eye_direction = vec3(2. * half_size_near.x * interp_uv.x - half_size_near.x,
                         2. * half_size_near.y * interp_uv.y - half_size_near.y, 
                         -1.0);
    local_light_pos = (view_mat * vec4(light_pos, 1.0)).xyz;
}
