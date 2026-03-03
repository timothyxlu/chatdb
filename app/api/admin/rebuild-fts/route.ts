// POST /api/admin/rebuild-fts — Rebuild the FTS5 index and embeddings from all messages.
//
// This re-reads every message, segments Chinese text with Intl.Segmenter,
// re-inserts into the FTS5 table, and regenerates embeddings in the vector store.
// Use after running the 0002 migration, or whenever you need to re-index.
//
// Auth: session (web UI) OR Bearer token (CLI / scripts).

import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { getCfEnv } from '@/lib/cf-env';
import { resolveToken } from '@/lib/token-auth';
import { db } from '@/lib/db';
import { ftsRebuildAll } from '@/lib/fts';
import { messages, sessions } from '@/lib/schema';
import { getEmbedding } from '@/lib/embed';
import { getVectorClient } from '@/lib/vector';

export async function POST(req: NextRequest) {
  const env = await getCfEnv();

  // Accept either session auth (web UI) or Bearer token (CLI)
  const session = await auth();
  const tokenCtx = !session?.user?.id
    ? await resolveToken(req.headers.get('Authorization'), env.DB)
    : null;

  if (!session?.user?.id && !tokenCtx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const database = db(env.DB);

  // Rebuild FTS index
  const ftsCount = await ftsRebuildAll(database);

  // Rebuild embeddings — join messages with sessions to get metadata
  const BATCH = 100;
  let offset = 0;
  let embCount = 0;
  const vectorClient = getVectorClient(env.VECTORIZE);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const rows = await database
      .select({
        id: messages.id,
        content: messages.content,
        role: messages.role,
        createdAt: messages.createdAt,
        sessionId: sessions.id,
        userId: sessions.userId,
        appId: sessions.appId,
      })
      .from(messages)
      .innerJoin(sessions, eq(messages.sessionId, sessions.id))
      .limit(BATCH)
      .offset(offset);

    if (rows.length === 0) break;

    const vectorRecords = [];
    for (const row of rows) {
      try {
        const values = await getEmbedding(row.content, env.AI);
        vectorRecords.push({
          id: row.id,
          values,
          metadata: {
            messageId: row.id,
            sessionId: row.sessionId,
            userId: row.userId,
            appId: row.appId,
            role: row.role,
            createdAt: row.createdAt,
          },
        });
        embCount++;
      } catch {
        // Non-fatal — skip messages that fail to embed
      }
    }

    if (vectorRecords.length > 0) {
      try {
        await vectorClient.upsert(vectorRecords);
      } catch {
        // Non-fatal — continue with next batch
      }
    }

    offset += BATCH;
  }

  return NextResponse.json({ rebuilt: true, messages_indexed: ftsCount, embeddings_indexed: embCount });
}
