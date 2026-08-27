#include "Database.h"
#include "OcrService.h"

#include <drogon/drogon.h>

#include <filesystem>
#include <memory>
#include <span>

int main() {
  using drogon::HttpRequestPtr;
  using drogon::HttpResponse;
  using drogon::HttpResponsePtr;

  auto database = std::make_shared<Database>(std::filesystem::path("data") / "keji.db");
  auto ocr = std::make_shared<OcrService>();

  drogon::app().registerHandler(
      "/api/health",
      [](const HttpRequestPtr&, std::function<void(const HttpResponsePtr&)>&& callback) {
        Json::Value result;
        result["status"] = "ok";
        result["service"] = "keji-backend";
        callback(HttpResponse::newHttpJsonResponse(result));
      },
      {drogon::Get});

  drogon::app().registerHandler(
      "/api/state",
      [database](const HttpRequestPtr&, std::function<void(const HttpResponsePtr&)>&& callback) {
        auto response = HttpResponse::newHttpResponse();
        response->setContentTypeCode(drogon::CT_APPLICATION_JSON);
        response->setBody(database->loadState());
        callback(response);
      },
      {drogon::Get});

  drogon::app().registerHandler(
      "/api/state",
      [database](const HttpRequestPtr& request, std::function<void(const HttpResponsePtr&)>&& callback) {
        database->saveState(std::string(request->body()));
        Json::Value result;
        result["saved"] = true;
        callback(HttpResponse::newHttpJsonResponse(result));
      },
      {drogon::Put});

  drogon::app().registerHandler(
      "/api/ocr/catalog",
      [ocr](const HttpRequestPtr& request, std::function<void(const HttpResponsePtr&)>&& callback) {
        drogon::MultiPartParser parser;
        if (parser.parse(request) != 0 || parser.getFiles().empty()) {
          auto response = HttpResponse::newHttpResponse();
          response->setStatusCode(drogon::k400BadRequest);
          response->setBody("Expected a multipart image file");
          callback(response);
          return;
        }

        try {
          const auto content = parser.getFiles().front().fileContent();
          const auto bytes = std::as_bytes(std::span(content.data(), content.size()));
          Json::Value result;
          result["text"] = ocr->recognize({reinterpret_cast<const unsigned char*>(bytes.data()), bytes.size()});
          callback(HttpResponse::newHttpJsonResponse(result));
        } catch (const std::exception& error) {
          Json::Value result;
          result["error"] = error.what();
          auto response = HttpResponse::newHttpJsonResponse(result);
          response->setStatusCode(drogon::k422UnprocessableEntity);
          callback(response);
        }
      },
      {drogon::Post});

  drogon::app()
      .addListener("127.0.0.1", 8787)
      .setThreadNum(2)
      .run();
}
