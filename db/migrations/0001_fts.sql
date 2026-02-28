-- ─────────────────────────────────────────────────────────────────────────────
-- FTS5 full-text search
--
-- Applied in both local Docker (docker-entrypoint.sh) and production D1
-- (deploy.yml). Cloudflare D1 fully supports the FTS5 module.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  content,
  content='messages',
  content_rowid='rowid'
);

-- Keep FTS in sync with the messages table via triggers
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

-- Back-fill: rebuild the entire FTS index from the messages content table.
-- 'rebuild' is the canonical FTS5 command for content tables — it reads all
-- rows from the source table (messages) and rebuilds the search index.
-- Safe to run repeatedly (idempotent).
INSERT INTO messages_fts(messages_fts) VALUES('rebuild');
