#include "Database.h"

#include <sqlite3.h>

#include <stdexcept>

namespace {
void check(int result, sqlite3* db, const char* operation) {
  if (result != SQLITE_OK && result != SQLITE_DONE && result != SQLITE_ROW) {
    throw std::runtime_error(std::string(operation) + ": " + sqlite3_errmsg(db));
  }
}
}  // namespace

Database::Database(const std::filesystem::path& path) {
  std::filesystem::create_directories(path.parent_path());
  check(sqlite3_open(path.string().c_str(), &db_), db_, "open database");
  initialize();
}

Database::~Database() {
  if (db_ != nullptr) sqlite3_close(db_);
}

void Database::initialize() {
  constexpr auto sql = R"(
    CREATE TABLE IF NOT EXISTS app_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  )";
  char* error = nullptr;
  const auto result = sqlite3_exec(db_, sql, nullptr, nullptr, &error);
  if (result != SQLITE_OK) {
    const std::string message = error == nullptr ? "initialize database" : error;
    sqlite3_free(error);
    throw std::runtime_error(message);
  }
}

std::string Database::loadState() {
  std::scoped_lock lock(mutex_);
  sqlite3_stmt* statement = nullptr;
  check(sqlite3_prepare_v2(db_, "SELECT payload FROM app_state WHERE id = 1", -1, &statement, nullptr), db_, "prepare load");
  const auto result = sqlite3_step(statement);
  std::string payload = "{}";
  if (result == SQLITE_ROW) {
    const auto* text = sqlite3_column_text(statement, 0);
    if (text != nullptr) payload = reinterpret_cast<const char*>(text);
  } else if (result != SQLITE_DONE) {
    check(result, db_, "load state");
  }
  sqlite3_finalize(statement);
  return payload;
}

void Database::saveState(const std::string& json) {
  std::scoped_lock lock(mutex_);
  constexpr auto sql = R"(
    INSERT INTO app_state (id, payload, updated_at) VALUES (1, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = CURRENT_TIMESTAMP
  )";
  sqlite3_stmt* statement = nullptr;
  check(sqlite3_prepare_v2(db_, sql, -1, &statement, nullptr), db_, "prepare save");
  check(sqlite3_bind_text(statement, 1, json.c_str(), static_cast<int>(json.size()), SQLITE_TRANSIENT), db_, "bind state");
  check(sqlite3_step(statement), db_, "save state");
  sqlite3_finalize(statement);
}
