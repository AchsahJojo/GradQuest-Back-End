CREATE TABLE IF NOT EXISTS page_cache (
  url TEXT PRIMARY KEY,
  excerpts_json TEXT NOT NULL,
  source TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
