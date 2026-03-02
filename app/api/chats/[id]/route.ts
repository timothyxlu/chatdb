// GET    /api/chats/[id] — fetch session + messages
// PATCH  /api/chats/[id] — update starred / archived
// DELETE /api/chats/[id] — delete session + FTS + vectors

import { NextRequest, NextResponse } from 'next/server';
import { eq, and, asc } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { getCfEnv } from '@/lib/cf-env';
import { sessions, messages } from '@/lib/schema';
import { getVectorClient } from '@/lib/vector';
import { ftsDelete, ftsInsert } from '@/lib/fts';

type RouteContext = { params: Promise<{ id: string }> };


export async function GET(req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const env = await getCfEnv();
  const database = db(env.DB);

  const [chatSession] = await database
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, session.user.id)))
    .limit(1);

  if (!chatSession) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const msgs = await database
    .select()
    .from(messages)
    .where(eq(messages.sessionId, id))
    .orderBy(asc(messages.createdAt));

  return NextResponse.json({ session: chatSession, messages: msgs });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const hasStarred = typeof body.starred === 'boolean';
  const hasArchived = typeof body.archived === 'boolean';
  if (!hasStarred && !hasArchived) {
    return NextResponse.json(
      { error: 'Body must include { starred?: boolean, archived?: boolean }' },
      { status: 400 },
    );
  }

  const env = await getCfEnv();
  const database = db(env.DB);

  const [chatSession] = await database
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, session.user.id)))
    .limit(1);

  if (!chatSession) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Build update payload
  const updates: Record<string, number> = {};
  if (hasStarred) updates.starred = body.starred ? 1 : 0;
  if (hasArchived) updates.archived = body.archived ? 1 : 0;

  await database.update(sessions).set(updates).where(eq(sessions.id, id));

  // Archive / unarchive: manage FTS and vector embeddings
  if (hasArchived) {
    const msgs = await database
      .select({ id: messages.id, content: messages.content })
      .from(messages)
      .where(eq(messages.sessionId, id));

    if (body.archived) {
      // Archiving → delete FTS entries and vector embeddings
      for (const msg of msgs) {
        try { await ftsDelete(database, msg.id); } catch {}
      }
      if (msgs.length > 0) {
        try { await getVectorClient(env.VECTORIZE).delete(msgs.map((m) => m.id)); } catch {}
      }
    } else {
      // Unarchiving → re-insert FTS entries (vectors not restored — too expensive)
      for (const msg of msgs) {
        try { await ftsInsert(database, msg.id, msg.content); } catch {}
      }
    }
  }

  return NextResponse.json({ id, ...updates });
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const env = await getCfEnv();
  const database = db(env.DB);

  // Verify ownership
  const [chatSession] = await database
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, session.user.id)))
    .limit(1);

  if (!chatSession) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Get message IDs for FTS/vector deletion
  const msgs = await database
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.sessionId, id));

  // Delete FTS entries (non-fatal)
  for (const msg of msgs) {
    try {
      await ftsDelete(database, msg.id);
    } catch {}
  }

  // Delete vectors (non-fatal)
  if (msgs.length > 0) {
    try {
      await getVectorClient(env.VECTORIZE).delete(msgs.map((m) => m.id));
    } catch {}
  }

  // Delete session (cascades to messages via FK)
  await database.delete(sessions).where(eq(sessions.id, id));

  return NextResponse.json({ deleted: id });
}
