-- Add scraped_at column to sessions table
-- Stores the timestamp (unix ms) when the source URL was scraped
ALTER TABLE sessions ADD COLUMN scraped_at INTEGER;
