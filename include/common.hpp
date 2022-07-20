#pragma once

// Standard Headers
#include <iostream>
#include <cstdio>
#include <cstdlib>
#include <vector>

// Vendor Headers
#include <glad/glad.h>
#include <GLFW/glfw3.h>
#include <glm/glm.hpp>
#include <glm/gtc/type_ptr.hpp>
#include <stb_image.h>

#include "config.hpp"

GLFWwindow*
initOpenGL(int width, int height, const char* title);
