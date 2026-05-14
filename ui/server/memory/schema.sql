-- Schema version sentinel
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- One row per assistant turn (or user turn that touches files)
CREATE TABLE IF NOT EXISTS turns (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id   TEXT NOT NULL,
  project      TEXT NOT NULL,
  source_path  TEXT NOT NULL,
  ts           INTEGER NOT NULL,
  role         TEXT NOT NULL,
  text         TEXT NOT NULL,
  files        TEXT NOT NULL,
  tools        TEXT NOT NULL,
  byte_offset  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id);
CREATE INDEX IF NOT EXISTS idx_turns_project ON turns(project);
CREATE INDEX IF NOT EXISTS idx_turns_ts      ON turns(ts DESC);
CREATE INDEX IF NOT EXISTS idx_turns_src     ON turns(source_path);

-- Contentless FTS5 mirror
CREATE VIRTUAL TABLE IF NOT EXISTS turns_fts USING fts5(
  text,
  files,
  content='turns',
  content_rowid='id',
  tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS turns_ai AFTER INSERT ON turns BEGIN
  INSERT INTO turns_fts(rowid, text, files) VALUES (new.id, new.text, new.files);
END;

CREATE TRIGGER IF NOT EXISTS turns_ad AFTER DELETE ON turns BEGIN
  INSERT INTO turns_fts(turns_fts, rowid, text, files) VALUES('delete', old.id, old.text, old.files);
END;

CREATE TRIGGER IF NOT EXISTS turns_au AFTER UPDATE ON turns BEGIN
  INSERT INTO turns_fts(turns_fts, rowid, text, files) VALUES('delete', old.id, old.text, old.files);
  INSERT INTO turns_fts(rowid, text, files) VALUES (new.id, new.text, new.files);
END;

-- Per-file watermark for resumable indexing
CREATE TABLE IF NOT EXISTS watermarks (
  source_path  TEXT PRIMARY KEY,
  byte_offset  INTEGER NOT NULL,
  mtime_ms     INTEGER NOT NULL,
  last_indexed INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'idle'
);
