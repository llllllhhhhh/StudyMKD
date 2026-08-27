#pragma once

#include <span>
#include <string>

class OcrService final {
 public:
  explicit OcrService(std::string language = "chi_sim+eng");
  [[nodiscard]] std::string recognize(std::span<const unsigned char> imageBytes) const;

 private:
  std::string language_;
};
