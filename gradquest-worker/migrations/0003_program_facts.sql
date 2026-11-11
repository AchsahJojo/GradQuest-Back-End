CREATE TABLE IF NOT EXISTS program_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  verified_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS program_facts (
  snapshot_id TEXT NOT NULL,
  fact_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  detail TEXT NOT NULL,
  source_url TEXT NOT NULL,
  quote TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, fact_id)
);
