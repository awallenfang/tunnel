#include "helper.hpp"

time_t get_filetime(const std::string filename) {
    struct stat result;
    if (stat(filename.c_str(), &result) == 0) {
        return result.st_mtime;
    }
}
