#!/bin/sh
# Docker entrypoint: apply DB schema then start the Next.js dev server.
set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ChatDB — development container"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo ""
echo "→ Applying database schema to ${SQLITE_PATH} …"
# drizzle-kit push reads drizzle.config.ts (dialect: turso, url: SQLITE_PATH).
# On a fresh database it creates all tables silently.
# On an unchanged database it exits with "No changes detected".
npx drizzle-kit push

echo ""
echo "→ Applying SQL migrations …"
# drizzle-kit push cannot create FTS5 virtual tables or triggers because they
# are SQLite-specific constructs not supported by Drizzle's schema DSL.
# All statements use IF NOT EXISTS so this is idempotent.
DB_FILE="${SQLITE_PATH#file:}"
# 0000_init.sql — core schema (tables, indexes)
sqlite3 "$DB_FILE" < /app/db/migrations/0000_init.sql
# 0001_fts.sql — FTS5 virtual table, triggers, and index rebuild
sqlite3 "$DB_FILE" < /app/db/migrations/0001_fts.sql
echo "  ✓ Done"

echo ""
echo "→ Back-filling vector embeddings (ChromaDB) …"
# Re-embeds any messages missing from ChromaDB (idempotent upsert).
# Runs on every start so vectors survive container/volume restarts.
npx tsx scripts/backfill-vectors.ts || echo "  ⚠ Vector backfill failed (non-fatal, search may be degraded)"

echo ""
echo "→ Starting Next.js dev server on http://localhost:3000 …"
exec npm run dev
