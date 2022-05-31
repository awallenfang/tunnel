#version 330 core

const float emission = 100.0;
const vec3 ka = vec3(0.05, 0.05, 0.05);
const vec3 kd = vec3(0.4, 0.4, 0.4);
const vec3 ks = vec3(1.0, 1.0, 1.0);
const float alpha = 5.0;

in vec2 interp_uv;
in vec3 eye_direction;
in vec3 local_light_pos;

out vec4 frag_color;

uniform sampler2D tex;
uniform mat4 proj_mat;

vec3 phong(vec3 l, vec3 n) {
    float d = length(l);
    vec3 ln = l / d;
    vec3 r = reflect(-ln, n);
    float intensity = 1.0/(d*d);
    float diff = clamp(dot(ln,n), 0.0, 1.0);
    float spec = clamp(pow(clamp(r.z, 0.0, 1.0), alpha), 0.0, 1.0);
    return ka + (kd * diff + ks * spec) * intensity * emission;
}

vec3 get_eye_position(float z) {
    // TASK
    // Compute the position in eye space using z and proj_mat
    float eye_z = proj_mat[3][2] / (proj_mat[2][3] * z - proj_mat[2][2]);
    return eye_direction * (-eye_z);
}

void main()
{
    vec4 tex_value = texture(tex, interp_uv);

    // TASK:
    // Read the normal and z value from the G-Buffer.
    // Note how the normal is written to the G-Buffer in the first pass!
    vec3 normal = 2 * tex_value.xyz - 1.;
    float z = tex_value[3];
    vec3 eye_pos = get_eye_position(z);

    vec3 color;
    if (length(normal) < 0.5) {
        color = vec3(0.6, 0.6, 0.6);
    } else {
        color = phong(local_light_pos - eye_pos, normal);
    }

    frag_color = vec4(color, 1.0);
}
