// PATCH /api/applications/[id] — update an application's display name

import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { getCfEnv } from '@/lib/cf-env';
import { applications, sessions } from '@/lib/schema';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const hasDisplayName = typeof body.displayName === 'string' && body.displayName.trim();
  const hasColorIndex = body.colorIndex !== undefined;
  if (!hasDisplayName && !hasColorIndex) {
    return NextResponse.json({ error: 'Body must include displayName or colorIndex' }, { status: 400 });
  }

  const env = await getCfEnv();
  const database = db(env.DB);

  // Verify the user has at least one session with this application
  const [userSession] = await database
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.appId, id), eq(sessions.userId, session.user.id)))
    .limit(1);

  if (!userSession) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const patch: { displayName?: string; colorIndex?: number | null } = {};
  if (hasDisplayName) patch.displayName = (body.displayName as string).trim();
  if (hasColorIndex) patch.colorIndex = typeof body.colorIndex === 'number' ? body.colorIndex : null;

  await database.update(applications).set(patch).where(eq(applications.id, id));

  return NextResponse.json({ id, ...patch });
}
