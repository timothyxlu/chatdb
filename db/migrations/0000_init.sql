-- ─────────────────────────────────────────────────────────────────────────────
-- Chats — initial schema
-- Compatible with both local SQLite and Cloudflare D1 (production).
-- FTS5 virtual table and triggers live in 0001_fts_sqlite.sql and are
-- applied locally only; D1 does not support the fts5 module.
-- ─────────────────────────────────────────────────────────────────────────────

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

-- ── OAuth Clients (Dynamic Client Registration — RFC 7591) ───────────────────
CREATE TABLE IF NOT EXISTS oauth_clients (
  id                  TEXT PRIMARY KEY,         -- client_id (UUID)
  client_secret_hash  TEXT,                     -- SHA-256(secret); NULL = PKCE-only
  redirect_uris       TEXT NOT NULL,            -- JSON array of allowed redirect URIs
  client_name         TEXT NOT NULL,
  client_uri          TEXT,
  created_at          INTEGER NOT NULL
);

-- ── OAuth Authorization Codes (short-lived, single-use) ──────────────────────
CREATE TABLE IF NOT EXISTS oauth_codes (
  code             TEXT PRIMARY KEY,            -- 48 random hex chars
  client_id        TEXT NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redirect_uri     TEXT NOT NULL,
  code_challenge   TEXT,                        -- PKCE S256 challenge; NULL = no PKCE
  expires_at       INTEGER NOT NULL,            -- unix ms
  used_at          INTEGER                      -- NULL = unused
);

CREATE INDEX IF NOT EXISTS idx_oauth_codes_client ON oauth_codes(client_id);

-- Applications are auto-created by MCP tools (save_session / create_session)
-- using the api_tokens.name of the connecting client. No seed data needed.
