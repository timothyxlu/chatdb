#!/usr/bin/env npx tsx
/**
 * Back-fill ChromaDB with embeddings for all messages that don't have a vector yet.
 *
 * Usage (inside Docker):
 *   npx tsx scripts/backfill-vectors.ts
 *
 * Usage (from host, talking to Docker services):
 *   SQLITE_PATH=file:/data/local.db \
 *   OLLAMA_URL=http://localhost:11434 \
 *   CHROMA_URL=http://localhost:8000 \
 *   npx tsx scripts/backfill-vectors.ts
 */

import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { eq } from 'drizzle-orm';
import * as schema from '../lib/schema';
const { messages, sessions } = schema;
import { getEmbedding } from '../lib/embed';
import { getVectorClient } from '../lib/vector';
import type { VectorRecord } from '../lib/vector';

async function main() {
  const url = process.env.SQLITE_PATH ?? 'file:./local.db';
  console.log(`📦 Database: ${url}`);
  console.log(`🧠 Ollama:   ${process.env.OLLAMA_URL ?? '(not set)'}`);
  console.log(`🗄️  Chroma:   ${process.env.CHROMA_URL ?? 'http://localhost:8000'}`);
  console.log('');

  const client = createClient({ url });
  const db = drizzle(client, { schema });
  const vectorClient = getVectorClient();

  // Fetch all messages with their session info
  const rows = await db
    .select({
      messageId: messages.id,
      sessionId: messages.sessionId,
      role: messages.role,
      content: messages.content,
      createdAt: messages.createdAt,
      userId: sessions.userId,
      appId: sessions.appId,
    })
    .from(messages)
    .innerJoin(sessions, eq(messages.sessionId, sessions.id));

  console.log(`Found ${rows.length} messages to embed.\n`);

  const BATCH_SIZE = 10;
  let success = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const records: VectorRecord[] = [];

    for (const row of batch) {
      try {
        const values = await getEmbedding(row.content);
        records.push({
          id: row.messageId,
          values,
          metadata: {
            messageId: row.messageId,
            sessionId: row.sessionId,
            userId: row.userId,
            appId: row.appId,
            role: row.role,
            createdAt: row.createdAt,
          },
        });
      } catch (err) {
        failed++;
        console.error(`  ✗ ${row.messageId}: ${err instanceof Error ? err.message : err}`);
      }
    }

    if (records.length > 0) {
      try {
        await vectorClient.upsert(records);
        success += records.length;
      } catch (err) {
        failed += records.length;
        console.error(`  ✗ Batch upsert failed: ${err instanceof Error ? err.message : err}`);
      }
    }

    const total = Math.min(i + BATCH_SIZE, rows.length);
    process.stdout.write(`\r  ⏳ ${total}/${rows.length} processed (${success} ok, ${failed} failed)`);
  }

  console.log(`\n\n✅ Done! ${success} vectors inserted, ${failed} failed.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
