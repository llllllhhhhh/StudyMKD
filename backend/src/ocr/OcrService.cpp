#include "OcrService.h"

#include <leptonica/allheaders.h>
#include <opencv2/imgcodecs.hpp>
#include <opencv2/imgproc.hpp>
#include <tesseract/baseapi.h>

#include <memory>
#include <stdexcept>
#include <vector>

OcrService::OcrService(std::string language) : language_(std::move(language)) {}

std::string OcrService::recognize(std::span<const unsigned char> imageBytes) const {
  const std::vector<unsigned char> encoded(imageBytes.begin(), imageBytes.end());
  auto image = cv::imdecode(encoded, cv::IMREAD_GRAYSCALE);
  if (image.empty()) throw std::invalid_argument("Unsupported or empty image");

  cv::Mat normalized;
  cv::threshold(image, normalized, 0, 255, cv::THRESH_BINARY | cv::THRESH_OTSU);

  tesseract::TessBaseAPI api;
  if (api.Init(nullptr, language_.c_str()) != 0) {
    throw std::runtime_error("Tesseract language data is unavailable");
  }
  api.SetPageSegMode(tesseract::PSM_AUTO);
  api.SetImage(normalized.data, normalized.cols, normalized.rows, 1, static_cast<int>(normalized.step));

  std::unique_ptr<char[]> text(api.GetUTF8Text());
  if (!text) throw std::runtime_error("OCR returned no text");
  return text.get();
}
