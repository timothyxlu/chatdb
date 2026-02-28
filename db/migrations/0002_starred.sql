-- Add starred flag to sessions
ALTER TABLE sessions ADD COLUMN starred INTEGER NOT NULL DEFAULT 0;
