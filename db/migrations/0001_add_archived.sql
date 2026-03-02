-- Add archived column to sessions table
-- archived = 0 (active, default), 1 (archived — hidden from list & search)
ALTER TABLE sessions ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;
