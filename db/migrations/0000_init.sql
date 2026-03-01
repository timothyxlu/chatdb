-- ─────────────────────────────────────────────────────────────────────────────
-- ChatDB — init schema
-- Compatible with both local SQLite and Cloudflare D1.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Core tables ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  github_id    TEXT UNIQUE NOT NULL,
  username     TEXT NOT NULL,
  avatar_url   TEXT,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS applications (
  id           TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  icon_url     TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_id        TEXT NOT NULL REFERENCES applications(id),
  title         TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  source_url    TEXT,
  starred       INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id   ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_app_id    ON sessions(app_id);
CREATE INDEX IF NOT EXISTS idx_sessions_updated   ON sessions(updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK(role IN ('user','assistant')),
  content     TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);

CREATE TABLE IF NOT EXISTS api_tokens (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  token_hash   TEXT UNIQUE NOT NULL,
  last_used_at INTEGER,
  created_at   INTEGER NOT NULL,
  revoked_at   INTEGER
);

CREATE INDEX IF NOT EXISTS idx_tokens_user_id    ON api_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_tokens_hash       ON api_tokens(token_hash);

-- ── OAuth (Dynamic Client Registration — RFC 7591) ──────────────────────────

CREATE TABLE IF NOT EXISTS oauth_clients (
  id                  TEXT PRIMARY KEY,
  client_secret_hash  TEXT,
  redirect_uris       TEXT NOT NULL,
  client_name         TEXT NOT NULL,
  client_uri          TEXT,
  created_at          INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_codes (
  code             TEXT PRIMARY KEY,
  client_id        TEXT NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redirect_uri     TEXT NOT NULL,
  code_challenge   TEXT,
  expires_at       INTEGER NOT NULL,
  used_at          INTEGER
);

CREATE INDEX IF NOT EXISTS idx_oauth_codes_client ON oauth_codes(client_id);

-- ── FTS5 full-text search ────────────────────────────────────────────────────

CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  content,
  content='messages',
  content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
END;

CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content)
  VALUES ('delete', old.rowid, old.content);
END;

CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content)
  VALUES ('delete', old.rowid, old.content);
  INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
END;

INSERT INTO messages_fts(messages_fts) VALUES('rebuild');
