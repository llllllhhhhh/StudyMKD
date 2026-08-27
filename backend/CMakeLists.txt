cmake_minimum_required(VERSION 3.24)
project(keji_backend VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

find_package(Drogon CONFIG REQUIRED)
find_package(OpenCV CONFIG REQUIRED)
find_package(Tesseract CONFIG REQUIRED)
find_package(unofficial-sqlite3 CONFIG REQUIRED)

add_executable(keji_backend
  src/main.cpp
  src/database/Database.cpp
  src/ocr/OcrService.cpp
)

target_include_directories(keji_backend PRIVATE include)
target_link_libraries(keji_backend PRIVATE
  Drogon::Drogon
  ${OpenCV_LIBS}
  Tesseract::libtesseract
  unofficial::sqlite3::sqlite3
)

if(MSVC)
  target_compile_options(keji_backend PRIVATE /W4 /permissive-)
else()
  target_compile_options(keji_backend PRIVATE -Wall -Wextra -Wpedantic)
endif()
