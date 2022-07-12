#include "common.hpp"
#include "shader.hpp"
#include "buffer.hpp"
#include "mesh.hpp"
#include "helper.hpp"
#include <iostream>
#include <chrono>
#include <string>
#include <filesystem>

int WINDOW_WIDTH = 1280;
int WINDOW_HEIGHT = 720;
int FPS = 60;
int samples = 1;

std::chrono::time_point<std::chrono::system_clock> start_time;

float getTimeDelta(int frame);

glm::uvec2 uRes;

glm::vec4 color;
glm::vec3 z;
std::vector<geometry> objects;
geometry object;
unsigned int fbo = 0;
unsigned int framebuffer_tex = 0;
unsigned int depth_rbo = 0;

unsigned int framebuffer_handle = 0;

void
resizeCallback(GLFWwindow* window, int width, int height);

// called whenever the window gets resized
void
resizeCallback(GLFWwindow* window, int width, int height);

void 
screenDump(int W, int H, int frame);

void write_frame(int W, int H, int frame);

unsigned int
create_texture_rgba32f(int width, int height) {
    unsigned int handle;
    glCreateTextures(GL_TEXTURE_2D, 1, &handle);
    glTextureStorage2D(handle, 1, GL_RGBA32F, width, height);

    return handle;
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
    if(glCheckNamedFramebufferStatus(fbo, GL_FRAMEBUFFER) != GL_FRAMEBUFFER_COMPLETE) {
        printf("Incomplete FBO!");
        std::terminate();
    }
}

int
main(int, char* argv[]) {
    GLFWwindow* window = initOpenGL(WINDOW_WIDTH, WINDOW_HEIGHT, argv[0]);
    glfwSetFramebufferSizeCallback(window, resizeCallback);

    std::string vertexShaderName = "tunnel.vert";
    std::string fragmentShaderName = "tunnel_gem.frag";

    if (const char *shaderOverride = std::getenv("SHADER_OVERWRITE")) {
        fragmentShaderName = std::string(shaderOverride) + ".frag";
        std::cout << "Overwriting the shaders with \"" << fragmentShaderName << "\"" << std::endl;
    }

    const char *shouldScreenDump = std::getenv("SCREEN_DUMP");
    if (shouldScreenDump) {
        std::filesystem::create_directories("screen_dump/");
    }

    // load and compile shaders and link program
<<<<<<< HEAD
    unsigned int vertexShader = compileShader(vertexShaderName.c_str(), GL_VERTEX_SHADER);
    unsigned int fragmentShader = compileShader(fragmentShaderName.c_str(), GL_FRAGMENT_SHADER);
=======
    unsigned int vertexShader = compileShader("tunnel_gem.vert", GL_VERTEX_SHADER);
    unsigned int fragmentShader = compileShader("voxel_trace.frag", GL_FRAGMENT_SHADER);
>>>>>>> 932610b (Yes)
    unsigned int shaderProgram = linkProgram(vertexShader, fragmentShader);
    // after linking the program the shader objects are no longer needed
    glDeleteShader(fragmentShader);
    glDeleteShader(vertexShader);

	// Define uniform variables
    glUseProgram(shaderProgram);
    int res = glGetUniformLocation(shaderProgram, "uRes");
    int time = glGetUniformLocation(shaderProgram, "uTime");
    int tex_loc = glGetUniformLocation(shaderProgram, "tex");
    int seed = glGetUniformLocation(shaderProgram, "seed");
    int sample_amt = glGetUniformLocation(shaderProgram, "samples");


    // vertex data
    float vertices[] = {
        -1.0f, -1.0f, 0.0f,
         1.f, -1.f, 0.0f,
         -1.f,1.f,0.f,
         1.0f,  1.f, 0.0f
    };

    unsigned int indices[] = {
        0, 1, 2, 1, 2, 3
    };

    unsigned int VAO;
    glGenVertexArrays(1, &VAO);
    glBindVertexArray(VAO);

    unsigned int VBO = makeBuffer(GL_ARRAY_BUFFER, GL_STATIC_DRAW, sizeof(vertices), vertices);
    glBindBuffer(GL_ARRAY_BUFFER, VBO);
    glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 3 * sizeof(float), (void*)0);
    glEnableVertexAttribArray(0);

    unsigned int IBO = makeBuffer(GL_ELEMENT_ARRAY_BUFFER, GL_STATIC_DRAW, sizeof(indices), indices);
    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, IBO);

    build_framebuffer(WINDOW_WIDTH, WINDOW_HEIGHT);

	// Define shader files to check for real-time recompiling
<<<<<<< HEAD
    const auto vs = "../shaders/" + vertexShaderName;
    const auto fs = "../shaders/" + fragmentShaderName;
=======
    const auto vs = "../shaders/tunnel_gem.vert";
    const auto fs = "../shaders/voxel_trace.frag";
>>>>>>> 932610b (Yes)

    auto dates = get_filetime(vs) + get_filetime(fs);
    auto newdates = dates;

    int frame = 0;

    // rendering loop
    while (!glfwWindowShouldClose(window)) {
        // check for shader reload
        newdates = get_filetime(vs) + get_filetime(fs);
        if (newdates != dates) {
            std::cout << "Recompiling shaders" << std::endl;
<<<<<<< HEAD
            vertexShader = compileShader(vertexShaderName.c_str(), GL_VERTEX_SHADER);
            fragmentShader = compileShader(fragmentShaderName.c_str(), GL_FRAGMENT_SHADER);
=======
            vertexShader = compileShader("tunnel_gem.vert", GL_VERTEX_SHADER);
            fragmentShader = compileShader("voxel_trace.frag", GL_FRAGMENT_SHADER);
>>>>>>> 932610b (Yes)
            shaderProgram = linkProgram(vertexShader, fragmentShader);
            
            res = glGetUniformLocation(shaderProgram, "uRes");
            time = glGetUniformLocation(shaderProgram, "uTime");
            tex_loc = glGetUniformLocation(shaderProgram, "tex");
            seed = glGetUniformLocation(shaderProgram, "time_seed");
            sample_amt = glGetUniformLocation(shaderProgram, "samples");
            // TODO: Add sample amount

            glDeleteShader(fragmentShader);
            glDeleteShader(vertexShader);
            dates = newdates;
        }

        // set background color...
        glClearColor(0.f, 0.f, 0.f, 1.0f);
        // and fill screen with it (therefore clearing the window)
        glClear(GL_COLOR_BUFFER_BIT);

        for (int i = 0; i<samples; i++) {
            const auto p1 = std::chrono::system_clock::now();

            int time_seed = std::chrono::duration_cast<std::chrono::milliseconds>(p1.time_since_epoch()).count();
            
            // render something...
            glUseProgram(shaderProgram);

            glEnable(GL_BLEND);
            glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);  

            // std::cout << getTimeDelta(frame) << "\n";
            glUniform1i(sample_amt, samples);
            glUniform1f(time, getTimeDelta(frame));
            glUniform1f(seed, rand());
            glUniform2ui(res, WINDOW_WIDTH, WINDOW_HEIGHT);
            glBindVertexArray(VAO);
            glDrawElements(GL_TRIANGLES, 6, GL_UNSIGNED_INT, (void*)0);
            // swap buffers with window == show rendered content
            glfwSwapBuffers(window);
        }

        
        // process window events
        glfwPollEvents();

        if (shouldScreenDump){
            screenDump(WINDOW_WIDTH, WINDOW_HEIGHT, frame);
        }
        // if (frame == 1) {
        //     break;
        // }
        frame++;
    }
    
    glDeleteFramebuffers(1, &fbo);
    glfwTerminate();
}

void resizeCallback(GLFWwindow*, int width, int height)
{
    // set new width and height as viewport size
    glViewport(0, 0, width, height);
    WINDOW_WIDTH = width;
    WINDOW_HEIGHT = height;
}

float getTimeDelta(int frame) {
    // auto now = std::chrono::system_clock::now();
    // return static_cast<float>((std::chrono::duration_cast<std::chrono::milliseconds>(now - start_time).count() % 500000) / 1000.f);
    return (float)frame / FPS;
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