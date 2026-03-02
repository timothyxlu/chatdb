// GET /api/stats — aggregate dashboard stats for the authenticated user

import { NextResponse } from 'next/server';
import { eq, and, sum, count, countDistinct, gte } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { getCfEnv } from '@/lib/cf-env';
import { sessions } from '@/lib/schema';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  const env = await getCfEnv();
  const database = db(env.DB);

  // All-time totals (exclude archived)
  const [totals] = await database
    .select({
      totalConversations: count(sessions.id),
      totalMessages: sum(sessions.messageCount),
      appsUsed: countDistinct(sessions.appId),
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), eq(sessions.archived, 0)));

  // Distinct app IDs (exclude archived)
  const appRows = await database
    .selectDistinct({ appId: sessions.appId })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), eq(sessions.archived, 0)));

  // This-week stats (exclude archived)
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const [weekTotals] = await database
    .select({
      conversations: count(sessions.id),
      messages: sum(sessions.messageCount),
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), eq(sessions.archived, 0), gte(sessions.createdAt, weekAgo)));

  const totalConversations = totals?.totalConversations ?? 0;
  const totalMessages = Number(totals?.totalMessages ?? 0);
  const appsUsed = totals?.appsUsed ?? 0;
  const avgMessagesPerChat =
    totalConversations > 0
      ? Math.round((totalMessages / totalConversations) * 10) / 10
      : 0;

  return NextResponse.json({
    totalConversations,
    totalMessages,
    appsUsed,
    appIds: appRows.map((r) => r.appId),
    avgMessagesPerChat,
    weekConversations: weekTotals?.conversations ?? 0,
    weekMessages: Number(weekTotals?.messages ?? 0),
  });
}
