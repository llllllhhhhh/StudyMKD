#pragma once

#include <filesystem>
#include <mutex>
#include <string>

struct sqlite3;

class Database final {
 public:
  explicit Database(const std::filesystem::path& path);
  ~Database();

  Database(const Database&) = delete;
  Database& operator=(const Database&) = delete;

  [[nodiscard]] std::string loadState();
  void saveState(const std::string& json);

 private:
  void initialize();

  sqlite3* db_ = nullptr;
  std::mutex mutex_;
};
