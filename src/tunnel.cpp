#include "common.hpp"
#include "shader.hpp"
#include "buffer.hpp"
#include "helper.hpp"
#include <iostream>
#include <filesystem>

int WINDOW_WIDTH = 1920;
int WINDOW_HEIGHT = 1080;
int FPS = 30;
int samples = 2000;
const int light_amt = 250;

float getTimeDelta(int frame);

glm::vec4 color;
glm::vec3 z;

unsigned int fbo = 0;
unsigned int framebuffer_tex = 0;
unsigned int depth_rbo = 0;

void
resizeCallback(GLFWwindow *window, int width, int height);

void
screenDump(int W, int H, int frame);

unsigned int
create_texture_rgba32f(int width, int height) {
    unsigned int handle;
    glCreateTextures(GL_TEXTURE_2D, 1, &handle);
    glTextureStorage2D(handle, 1, GL_RGBA32F, width, height);

    return handle;
}

unsigned int
create_texture_rgba32f(int width, int height, float *data) {
    unsigned int handle;
    glCreateTextures(GL_TEXTURE_2D, 1, &handle);
    glTextureStorage2D(handle, 1, GL_RGBA32F, width, height);
    glTextureSubImage2D(handle, 0, 0, 0, width, height, GL_RGBA, GL_FLOAT, data);

    return handle;
}

float *
load_texture_data(const std::string& filename, int *width, int *height) {
    int channels;
    unsigned char *file_data = stbi_load(filename.c_str(), width, height, &channels, 3);

    int w = *width;
    int h = *height;

    auto *data = new float[4 * w * h];
    for (int j = 0; j < h; ++j) {
        for (int i = 0; i < w; ++i) {
            data[j * w * 4 + i * 4 + 0] = static_cast<float>(file_data[j * w * 3 + i * 3 + 0]) / 255;
            data[j * w * 4 + i * 4 + 1] = static_cast<float>(file_data[j * w * 3 + i * 3 + 1]) / 255;
            data[j * w * 4 + i * 4 + 2] = static_cast<float>(file_data[j * w * 3 + i * 3 + 2]) / 255;
            data[j * w * 4 + i * 4 + 3] = 1.f;
        }
    }

    delete[] file_data;

    return data;
}

void build_framebuffer(int width, int height) {
    if (framebuffer_tex) {
        glDeleteTextures(1, &framebuffer_tex);
    }

    if (depth_rbo) {
        glDeleteRenderbuffers(1, &depth_rbo);
    }

    if (fbo) {
        glDeleteFramebuffers(1, &fbo);
    }

    framebuffer_tex = create_texture_rgba32f(width, height);
    glCreateRenderbuffers(1, &depth_rbo);
    glNamedRenderbufferStorage(depth_rbo, GL_DEPTH_COMPONENT32, width, height);

    glCreateFramebuffers(1, &fbo);
    glNamedFramebufferTexture(fbo, GL_COLOR_ATTACHMENT0, framebuffer_tex, 0);
    glNamedFramebufferRenderbuffer(fbo, GL_DEPTH_ATTACHMENT, GL_RENDERBUFFER, depth_rbo);
    if (glCheckNamedFramebufferStatus(fbo, GL_FRAMEBUFFER) != GL_FRAMEBUFFER_COMPLETE) {
        printf("Incomplete FBO!");
        std::terminate();
    }
}

int
main(int, char *argv[]) {
    GLFWwindow *window = initOpenGL(WINDOW_WIDTH, WINDOW_HEIGHT, argv[0]);
    glfwSetFramebufferSizeCallback(window, resizeCallback);

    std::string vertexShaderName = "tunnel.vert";
    std::string fragmentShaderName = "voxel_trace.frag";

    if (const char *shaderOverride = std::getenv("SHADER_OVERWRITE")) {
        fragmentShaderName = std::string(shaderOverride) + ".frag";
        std::cout << "Overwriting the shaders with \"" << fragmentShaderName << "\"" << std::endl;
    }

    const char *shouldScreenDump = std::getenv("SCREEN_DUMP");
    if (shouldScreenDump) {
        std::filesystem::create_directories("screen_dump/");
    }

    // load and compile shaders and link program
    unsigned int vertexShader = compileShader(vertexShaderName.c_str(), GL_VERTEX_SHADER);
    unsigned int fragmentShader = compileShader(fragmentShaderName.c_str(), GL_FRAGMENT_SHADER);

    unsigned int shaderProgram = linkProgram(vertexShader, fragmentShader);
    // after linking the program the shader objects are no longer needed
    glDeleteShader(fragmentShader);
    glDeleteShader(vertexShader);

    // Define uniform variables
    glUseProgram(shaderProgram);
    int res = glGetUniformLocation(shaderProgram, "uRes");
    int time = glGetUniformLocation(shaderProgram, "uTime");
    int tex_loc = glGetUniformLocation(shaderProgram, "tex");
    int seed = glGetUniformLocation(shaderProgram, "init_seed");
    int sample_amt = glGetUniformLocation(shaderProgram, "samples");
    int sample_num = glGetUniformLocation(shaderProgram, "sample_number");
    int x0 = glGetUniformLocation(shaderProgram, "x0");
    int x1 = glGetUniformLocation(shaderProgram, "x1");
    int y0 = glGetUniformLocation(shaderProgram, "y0");
    int y1 = glGetUniformLocation(shaderProgram, "y1");
    int light_pos = glGetUniformLocation(shaderProgram, "light_pos");
    int light_col = glGetUniformLocation(shaderProgram, "light_col");

    // Render Texture Shader
    vertexShaderName = "render_image.vert";
    fragmentShaderName = "render_image.frag";

    // load and compile shaders and link program
    vertexShader = compileShader(vertexShaderName.c_str(), GL_VERTEX_SHADER);
    fragmentShader = compileShader(fragmentShaderName.c_str(), GL_FRAGMENT_SHADER);

    unsigned int renderTextureShader = linkProgram(vertexShader, fragmentShader);
    // after linking the program the shader objects are no longer needed
    glDeleteShader(fragmentShader);
    glDeleteShader(vertexShader);

    // Define uniform variables
    glUseProgram(renderTextureShader);
    glUniform1i(glGetUniformLocation(renderTextureShader, "tex"), 0);
    int sample_texShader = glGetUniformLocation(renderTextureShader, "sample_num");
    int samples_texShader = glGetUniformLocation(renderTextureShader, "samples");

    // vertex data
    float vertices[] = {
            -1.0f, -1.0f, 0.0f,
            1.f, -1.f, 0.0f,
            -1.f, 1.f, 0.f,
            1.0f, 1.f, 0.0f
    };

    unsigned int indices[] = {
            0, 1, 2, 1, 2, 3
    };

    unsigned int VAO;
    glGenVertexArrays(1, &VAO);
    glBindVertexArray(VAO);

    unsigned int VBO = makeBuffer(GL_ARRAY_BUFFER, GL_STATIC_DRAW, sizeof(vertices), vertices);
    glBindBuffer(GL_ARRAY_BUFFER, VBO);
    glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 3 * sizeof(float), (void *) nullptr);
    glEnableVertexAttribArray(0);

    unsigned int IBO = makeBuffer(GL_ELEMENT_ARRAY_BUFFER, GL_STATIC_DRAW, sizeof(indices), indices);
    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, IBO);

    int image_width, image_height;
    float *image_tex_data = load_texture_data(DATA_ROOT + "rustymetal.jpg", &image_width, &image_height);
    unsigned int image_tex = create_texture_rgba32f(image_width, image_height, image_tex_data);
    glBindTextureUnit(0, image_tex);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_REPEAT);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_REPEAT);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR_MIPMAP_LINEAR);
    glGenerateMipmap(GL_TEXTURE_2D);
    delete[] image_tex_data;

    build_framebuffer(WINDOW_WIDTH, WINDOW_HEIGHT);

    // Define shader files to check for real-time recompiling
    const auto vs = "../shaders/" + vertexShaderName;
    const auto fs = "../shaders/" + fragmentShaderName;

    auto dates = get_filetime(vs) + get_filetime(fs);
    auto newdates = dates;

    int frame = 1;

    // Gem object inits
    std::vector<glm::vec3> light_positions;
    std::vector<glm::int32> light_colors;

    for (int i = 0; i < light_amt; i++) {
        int rando = rand();
        light_positions.push_back(glm::vec3(cos(rando) * 5., abs(sin(rando)) * 5., 0.2f * i - 0.2f));
    }


    for (int i = 0; i < light_amt; i++) {
        light_colors.push_back((rand() % 4) + 3);
    }

    float t0 = glfwGetTime();
    float frame_t0 = glfwGetTime();

    bool test = true;

    // rendering loop
    while (!glfwWindowShouldClose(window)) {
        // check for shader reload
        newdates = get_filetime(vs) + get_filetime(fs);
        if (newdates != dates) {
            std::cout << "Recompiling shaders" << std::endl;
            vertexShader = compileShader(vertexShaderName.c_str(), GL_VERTEX_SHADER);
            fragmentShader = compileShader(fragmentShaderName.c_str(), GL_FRAGMENT_SHADER);
            shaderProgram = linkProgram(vertexShader, fragmentShader);

            res = glGetUniformLocation(shaderProgram, "uRes");
            time = glGetUniformLocation(shaderProgram, "uTime");
            tex_loc = glGetUniformLocation(shaderProgram, "tex");
            seed = glGetUniformLocation(shaderProgram, "init_seed");
            sample_amt = glGetUniformLocation(shaderProgram, "samples");
            sample_num = glGetUniformLocation(shaderProgram, "sample_number");
            x0 = glGetUniformLocation(shaderProgram, "x0");
            x1 = glGetUniformLocation(shaderProgram, "x1");
            y0 = glGetUniformLocation(shaderProgram, "y0");
            y1 = glGetUniformLocation(shaderProgram, "y1");
            light_pos = glGetUniformLocation(shaderProgram, "light_pos");
            light_col = glGetUniformLocation(shaderProgram, "light_col");

            glDeleteShader(fragmentShader);
            glDeleteShader(vertexShader);
            dates = newdates;
        }

        glBindFramebuffer(GL_FRAMEBUFFER, fbo);
        // set background color...
        glClearColor(0.f, 0.f, 0.f, 0.0f);
        // and fill screen with it (therefore clearing the window)
        glClear(GL_COLOR_BUFFER_BIT);

        glUseProgram(shaderProgram);

        glEnable(GL_BLEND);
        glBlendEquation(GL_FUNC_ADD);
        glBlendFuncSeparate(GL_SRC_ALPHA, GL_ONE, GL_ONE, GL_ONE);
        glUniform1i(sample_amt, samples);
        glUniform1i(tex_loc, 0);
        glUniform2ui(res, WINDOW_WIDTH, WINDOW_HEIGHT);
        glUniform3fv(light_pos, light_amt, glm::value_ptr(light_positions[0]));
        glUniform1iv(light_col, light_amt, &light_colors[0]);

        glBindVertexArray(VAO);

        int screenDivisions = 5;
        int x = (screenDivisions - 1) / 2;
        int y = screenDivisions / 2;
        int step = 0;
        int stepsize = 1;
        int dirX = 0;
        int dirY = -1;
        while(x >= 0 && x < screenDivisions && y >= 0 && y < screenDivisions) {
            for (int i = 0; i < samples; i++) {
                glUniform1i(sample_num, i);
                glUniform1f(x0, float(x) / float(screenDivisions));
                glUniform1f(x1, float(x + 1) / float(screenDivisions));
                glUniform1f(y0, float(y) / float(screenDivisions));
                glUniform1f(y1, float(y + 1) / float(screenDivisions));
                glUniform1f(time, getTimeDelta(frame));
                glUniform1i(seed, rand());

                glDrawElements(GL_TRIANGLES, 6, GL_UNSIGNED_INT, (void*)0);

#ifdef _WIN32
                Sleep(2.0f);
#else
                sleep(0.002f);
#endif

                if (glfwGetTime() - frame_t0 > 1.0 / 60.0) {
                //if (test) {
                    frame_t0 = glfwGetTime();
                    glBindFramebuffer(GL_FRAMEBUFFER, 0);

                    glClear(GL_COLOR_BUFFER_BIT);

                    glUseProgram(renderTextureShader);
                    glActiveTexture(GL_TEXTURE0);
                    glBindTexture(GL_TEXTURE_2D, framebuffer_tex);
                    glUniform1i(sample_texShader, i + 1);
                    glUniform1i(samples_texShader, samples);
                    glUniform1f(x0, float(WINDOW_WIDTH) * float(x) / float(screenDivisions));
                    glUniform1f(x1, float(WINDOW_WIDTH) * float(x + 1) / float(screenDivisions));
                    glUniform1f(y0, float(WINDOW_HEIGHT) * float(y) / float(screenDivisions));
                    glUniform1f(y1, float(WINDOW_HEIGHT) * float(y + 1) / float(screenDivisions));

                    glDrawElements(GL_TRIANGLES, 6, GL_UNSIGNED_INT, (void*) 0);
                    glfwSwapBuffers(window);

                    glBindFramebuffer(GL_FRAMEBUFFER, fbo);

                    glUseProgram(shaderProgram);
                }
                glfwPollEvents();
                test = !test;

                if (glfwWindowShouldClose(window)) break;
            }

            x += dirX;
            y += dirY;
            step++;
            if (step == stepsize) {
                if (dirY == 0) {
                    stepsize++;
                }
                int temp = dirX;
                dirX = -dirY;
                dirY = temp;
                step = 0;
            }

            if (glfwWindowShouldClose(window)) break;
        }
        glBindFramebuffer(GL_FRAMEBUFFER, 0);

        glClear(GL_COLOR_BUFFER_BIT);

        glUseProgram(renderTextureShader);
        glActiveTexture(GL_TEXTURE0);
        glBindTexture(GL_TEXTURE_2D, framebuffer_tex);
        glUniform1i(sample_texShader, samples);
        glUniform1i(samples_texShader, samples);
        glUniform1f(x0, -1.0);
        glUniform1f(x1, -1.0);
        glUniform1f(y0, -1.0);
        glUniform1f(y1, -1.0);

        glDrawElements(GL_TRIANGLES, 6, GL_UNSIGNED_INT, (void*)0);
        glfwSwapBuffers(window);

        glBindFramebuffer(GL_FRAMEBUFFER, fbo);

        glUseProgram(shaderProgram);

        // process window events
        glfwPollEvents();

        if (shouldScreenDump) {
            screenDump(WINDOW_WIDTH, WINDOW_HEIGHT, frame);
        }
        if (frame == 300) {
            break;
        }
        frame++;

        float t1 = glfwGetTime();
        float dt = t1 - t0;
        t0 = t1;
        std::cout << "Frame time: " << int(dt * 1000.0) << "ms, ETA: " << int(float(300 - frame) * dt) << "s" << std::endl;
    }

    glDeleteFramebuffers(1, &fbo);
    glfwTerminate();
}

void resizeCallback(GLFWwindow *, int width, int height) {
    // set new width and height as viewport size
    glViewport(0, 0, width, height);
    WINDOW_WIDTH = width;
    WINDOW_HEIGHT = height;
}

float getTimeDelta(int frame) {
    return (float) frame / (float) FPS;
}

void screenDump(int W, int H, int frame) {
    char filename[33];

    std::sprintf(filename, "screen_dump/frame_%04d.tga", frame);
    FILE *outputFile = fopen(filename, "wb");

    char *pixel_data = new char[3 * W * H];
    short TGAhead[] = {0, 2, 0, 0, 0, 0, (short) W, (short) H, 24};

    glReadBuffer(GL_FRONT);
    glReadPixels(0, 0, W, H, GL_BGR, GL_UNSIGNED_BYTE, pixel_data);

    fwrite(&TGAhead, sizeof(TGAhead), 1, outputFile);
    fwrite(pixel_data, 3 * W * H, 1, outputFile);
    fclose(outputFile);

    delete[] pixel_data;
} 