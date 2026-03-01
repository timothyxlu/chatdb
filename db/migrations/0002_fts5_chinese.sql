-- ─────────────────────────────────────────────────────────────────────────────
-- FTS5 Chinese tokenization support
--
-- Switches from trigger-based external-content FTS5 to a standalone FTS5 table
-- managed by application code, so we can pre-segment Chinese text with
-- Intl.Segmenter before indexing.
--
-- After running this migration, call the rebuild-fts API endpoint
-- (POST /api/admin/rebuild-fts) to re-index all existing messages.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop old auto-sync triggers (FTS is now managed in application code)
DROP TRIGGER IF EXISTS messages_ai;
DROP TRIGGER IF EXISTS messages_ad;
DROP TRIGGER IF EXISTS messages_au;

-- Drop old external-content FTS table
DROP TABLE IF EXISTS messages_fts;

-- Create standalone FTS5 table with unicode61 tokenizer.
-- content:    segmented text (CJK words separated by spaces)
-- message_id: maps back to messages.id (UNINDEXED = not searchable, just stored)
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  content,
  message_id UNINDEXED,
  tokenize='unicode61'
);
