// GET /api/chats — list sessions for the authenticated user
// Supports: ?app=claude&starred=1&since=1700000000000&until=1710000000000&limit=20&offset=0

import { NextRequest, NextResponse } from 'next/server';
import { eq, and, asc, desc, gte, lte } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { getCfEnv } from '@/lib/cf-env';
import { sessions, messages } from '@/lib/schema';


export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  const { searchParams } = req.nextUrl;
  const app = searchParams.get('app') ?? undefined;
  const starred = searchParams.get('starred');
  const archived = searchParams.get('archived');
  const since = searchParams.get('since');
  const until = searchParams.get('until');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 100);
  const offset = parseInt(searchParams.get('offset') ?? '0');

  const env = await getCfEnv();
  const database = db(env.DB);

  const conditions = [eq(sessions.userId, userId)];
  if (app) conditions.push(eq(sessions.appId, app));
  if (starred === '1') conditions.push(eq(sessions.starred, 1));
  if (archived === '1') {
    conditions.push(eq(sessions.archived, 1));
  } else {
    conditions.push(eq(sessions.archived, 0));
  }
  if (since) conditions.push(gte(sessions.createdAt, parseInt(since)));
  if (until) conditions.push(lte(sessions.createdAt, parseInt(until)));

  const rows = await database
    .select()
    .from(sessions)
    .where(and(...conditions))
    .orderBy(desc(sessions.updatedAt))
    .limit(limit)
    .offset(offset);

  // Fetch first message preview for each session
  const sessionIds = rows.map((r) => r.id);
  const previewMap: Record<string, string> = {};

  if (sessionIds.length > 0) {
    // Batch fetch first message per session (by earliest createdAt)
    const firstMessages = await Promise.all(
      sessionIds.map(async (sid) => {
        const [msg] = await database
          .select({ sessionId: messages.sessionId, content: messages.content })
          .from(messages)
          .where(eq(messages.sessionId, sid))
          .orderBy(asc(messages.createdAt))
          .limit(1);
        return msg;
      })
    );
    for (const msg of firstMessages) {
      if (msg) previewMap[msg.sessionId] = msg.content.slice(0, 200);
    }
  }

  const result = rows.map((r) => ({
    ...r,
    preview: previewMap[r.id] ?? null,
  }));

  return NextResponse.json({ sessions: result, limit, offset });
}
