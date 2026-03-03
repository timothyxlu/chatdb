// POST /api/ingest — Upload a conversation from a browser extension.
//
// Auth: Authorization: Bearer chatdb_tk_…  (same token format as MCP)
// Body: { app, title?, overwrite?, messages: [{role, content, created_at?}], metadata? }

import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getCfEnv } from '@/lib/cf-env';
import { resolveToken } from '@/lib/token-auth';
import { sessions, messages, applications } from '@/lib/schema';
import { getEmbedding } from '@/lib/embed';
import { getVectorClient } from '@/lib/vector';
import { ftsInsert, ftsDelete } from '@/lib/fts';


const IngestSchema = z.object({
  app: z.string().min(1),
  title: z.string().optional(),
  overwrite: z.boolean().optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1),
        created_at: z.number().optional(),
      })
    )
    .min(1),
  metadata: z
    .object({
      source_url: z.string().url().optional(),
      scraped_at: z.number().optional(),
    })
    .optional(),
});

export async function POST(req: NextRequest) {
  // 1. Authenticate via Bearer token
  const env = await getCfEnv();
  const tokenCtx = await resolveToken(req.headers.get('Authorization'), env.DB);
  if (!tokenCtx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { userId } = tokenCtx;

  // 2. Parse body
  let body: z.infer<typeof IngestSchema>;
  try {
    body = IngestSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request body', details: String(err) }, { status: 400 });
  }

  const { app, title, overwrite, messages: msgs, metadata } = body;
  const database = db(env.DB);
  const now = Date.now();

  // 3. Deduplication — if source_url already exists for this user, skip or overwrite
  let existingSessionId: string | null = null;
  if (metadata?.source_url) {
    const [existing] = await database
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.userId, userId), eq(sessions.sourceUrl, metadata.source_url)))
      .limit(1);

    if (existing) {
      if (!overwrite) {
        return NextResponse.json({ session_id: existing.id, created: false });
      }
      existingSessionId = existing.id;
    }
  }

  // 4. Ensure application row exists
  await database
    .insert(applications)
    .values({ id: app, displayName: app })
    .onConflictDoNothing();

  const derivedTitle =
    title ?? msgs.find((m) => m.role === 'user')?.content.slice(0, 80) ?? 'Untitled';

  // 5. Overwrite: delete old messages, FTS, and vectors
  let sessionId: string;
  if (existingSessionId) {
    sessionId = existingSessionId;

    const oldMsgs = await database
      .select({ id: messages.id })
      .from(messages)
      .where(eq(messages.sessionId, sessionId));

    for (const msg of oldMsgs) {
      try { await ftsDelete(database, msg.id); } catch { /* non-fatal */ }
    }
    if (oldMsgs.length > 0) {
      try { await getVectorClient(env.VECTORIZE).delete(oldMsgs.map((m) => m.id)); } catch {}
    }

    await database.delete(messages).where(eq(messages.sessionId, sessionId));
    await database.update(sessions).set({
      appId: app,
      title: derivedTitle,
      messageCount: msgs.length,
      scrapedAt: metadata?.scraped_at ? metadata.scraped_at * 1000 : null,
      updatedAt: now,
    }).where(eq(sessions.id, sessionId));
  } else {
    sessionId = crypto.randomUUID();
    await database.insert(sessions).values({
      id: sessionId,
      userId,
      appId: app,
      title: derivedTitle,
      messageCount: msgs.length,
      sourceUrl: metadata?.source_url ?? null,
      scrapedAt: metadata?.scraped_at ? metadata.scraped_at * 1000 : null,
      createdAt: now,
      updatedAt: now,
    });
  }

  // 6. Insert messages + embed
  const vectorRecords = [];
  for (const msg of msgs) {
    const msgId = crypto.randomUUID();
    const createdAt = msg.created_at ? msg.created_at * 1000 : now;

    await database.insert(messages).values({
      id: msgId,
      sessionId,
      role: msg.role,
      content: msg.content,
      createdAt,
    });

    // Index for FTS5 with Chinese word segmentation
    try { await ftsInsert(database, msgId, msg.content); } catch { /* non-fatal */ }

    try {
      const values = await getEmbedding(msg.content, env.AI);
      vectorRecords.push({
        id: msgId,
        values,
        metadata: { messageId: msgId, sessionId, userId, appId: app, role: msg.role, createdAt },
      });
    } catch {
      // Non-fatal — FTS still works without vectors
    }
  }

  if (vectorRecords.length > 0) {
    try {
      await getVectorClient(env.VECTORIZE).upsert(vectorRecords);
    } catch {}
  }

  const status = existingSessionId ? 200 : 201;
  return NextResponse.json({
    session_id: sessionId,
    message_count: msgs.length,
    created: !existingSessionId,
    overwritten: !!existingSessionId,
  }, { status });
}
