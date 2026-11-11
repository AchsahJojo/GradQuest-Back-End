CREATE TABLE IF NOT EXISTS resume_chunks (
  user_id TEXT NOT NULL,
  chunk_id TEXT NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (user_id, chunk_id)
);

CREATE TABLE IF NOT EXISTS page_reads (
  school_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  excerpts_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
