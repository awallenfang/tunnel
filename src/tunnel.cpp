#include "common.hpp"
#include "shader.hpp"
#include "buffer.hpp"
#include "mesh.hpp"
#include "helper.hpp"
#include <iostream>
#include <chrono>
#include <string>

int WINDOW_WIDTH = 1280;
int WINDOW_HEIGHT = 720;
int FPS = 60;

std::chrono::time_point<std::chrono::system_clock> start_time;

float getTimeDelta(int frame);

glm::uvec2 uRes;

glm::vec4 color;
glm::vec3 z;
std::vector<geometry> objects;
geometry object;

unsigned int framebuffer_handle = 0;

void
resizeCallback(GLFWwindow* window, int width, int height);

// called whenever the window gets resized
void
resizeCallback(GLFWwindow* window, int width, int height);

void 
screendump(int W, int H, int frame);

void write_frame(int W, int H, int frame);

int
main(int, char* argv[]) {
    GLFWwindow* window = initOpenGL(WINDOW_WIDTH, WINDOW_HEIGHT, argv[0]);
    glfwSetFramebufferSizeCallback(window, resizeCallback);

    // Initiate uniforms

    // load and compile shaders and link program
    unsigned int vertexShader = compileShader("tunnel_gem.vert", GL_VERTEX_SHADER);
    unsigned int fragmentShader = compileShader("tunnel_gem.frag", GL_FRAGMENT_SHADER);
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

    GLuint accum_framebuffer;
    glGenFramebuffers(1, &accum_framebuffer);
    glBindFramebuffer(GL_FRAMEBUFFER, accum_framebuffer);

    GLuint texColorBuffer;
    glGenTextures(1, &texColorBuffer);
    glBindTexture(GL_TEXTURE_2D, texColorBuffer);

    glTexImage2D(
        GL_TEXTURE_2D, 0, GL_RGB, WINDOW_WIDTH, WINDOW_HEIGHT, 0, GL_RGB, GL_UNSIGNED_BYTE, NULL
    );

    glFramebufferTexture2D(
        GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, texColorBuffer, 0
    );

    unsigned int rbo;
    glGenRenderbuffers(1, &rbo);
    glBindRenderbuffer(GL_RENDERBUFFER, rbo); 
    glRenderbufferStorage(GL_RENDERBUFFER, GL_DEPTH24_STENCIL8, 800, 600);  
    glBindRenderbuffer(GL_RENDERBUFFER, 0);

    glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_DEPTH_STENCIL_ATTACHMENT, GL_RENDERBUFFER, rbo);

    if(glCheckFramebufferStatus(GL_FRAMEBUFFER) != GL_FRAMEBUFFER_COMPLETE)
	std::cout << "ERROR::FRAMEBUFFER:: Framebuffer is not complete!" << std::endl;
    glBindFramebuffer(GL_FRAMEBUFFER, 0);  

	// Define shader files to check for real-time recompiling
    const auto vs = "../shaders/tunnel_gem.vert";
    const auto fs = "../shaders/tunnel_gem.frag";

    auto dates = get_filetime(vs) + get_filetime(fs);
    auto newdates = dates;

    int frame = 0;

    // rendering loop
    while (!glfwWindowShouldClose(window)) {
        const auto p1 = std::chrono::system_clock::now();

        int time_seed = std::chrono::duration_cast<std::chrono::milliseconds>(p1.time_since_epoch()).count();
        // check for shader reload
        newdates = get_filetime(vs) + get_filetime(fs);
        if (newdates != dates) {
            std::cout << "Recompiling shaders" << std::endl;
            vertexShader = compileShader("tunnel_gem.vert", GL_VERTEX_SHADER);
            fragmentShader = compileShader("tunnel_gem.frag", GL_FRAGMENT_SHADER);
            shaderProgram = linkProgram(vertexShader, fragmentShader);
            
            res = glGetUniformLocation(shaderProgram, "uRes");
            time = glGetUniformLocation(shaderProgram, "uTime");
            tex_loc = glGetUniformLocation(shaderProgram, "tex");
            seed = glGetUniformLocation(shaderProgram, "time_seed");

            glDeleteShader(fragmentShader);
            glDeleteShader(vertexShader);
            dates = newdates;
        }

        // set background color...
        glClearColor(0.f, 0.f, 0.f, 1.0f);
        // and fill screen with it (therefore clearing the window)
        glClear(GL_COLOR_BUFFER_BIT);

        // render something...
        glUseProgram(shaderProgram);


        glBindFramebuffer(GL_FRAMEBUFFER, accum_framebuffer);


        // std::cout << getTimeDelta(frame) << "\n";
        glBindTextureUnit(0, texColorBuffer);
        glUniform1i(tex_loc, 0);
        glUniform1f(time, getTimeDelta(frame));
        glUniform1f(seed, time_seed);
        glUniform2ui(res, WINDOW_WIDTH, WINDOW_HEIGHT);
        glBindVertexArray(VAO);
        glDrawElements(GL_TRIANGLES, 6, GL_UNSIGNED_INT, (void*)0);

        glBlitNamedFramebuffer(accum_framebuffer, 0, 0, 0, WINDOW_WIDTH, WINDOW_HEIGHT, 0, 0, WINDOW_WIDTH, WINDOW_HEIGHT, NULL, GL_NEAREST);
        // swap buffers with window == show rendered content
        glfwSwapBuffers(window);
        // process window events
        glfwPollEvents();

        screendump(WINDOW_WIDTH, WINDOW_HEIGHT, frame);
        if (frame == 1) {
            break;
        }
        //frame++;
    }
    
    glDeleteFramebuffers(1, &accum_framebuffer);
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

void screendump(int W, int H, int frame) {
    char num[20];
    std::sprintf(num, "frame_%04d.tga", frame);
    FILE   *out = fopen(num,"wb");
    char   *pixel_data = new char[3*W*H];
    short  TGAhead[] = { 0, 2, 0, 0, 0, 0, W, H, 24 };

    glReadBuffer(GL_FRONT);
    glReadPixels(0, 0, W, H, GL_BGR, GL_UNSIGNED_BYTE, pixel_data);

    fwrite(&TGAhead,sizeof(TGAhead),1,out);
    fwrite(pixel_data, 3*W*H, 1, out);
    fclose(out);

    delete[] pixel_data; 
} 