// GET /api/applications — list AI applications that the current user has at least one session for

import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { getCfEnv } from '@/lib/cf-env';
import { applications, sessions } from '@/lib/schema';


export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const env = await getCfEnv();
  const database = db(env.DB);

  // Only return applications for which this user has at least one session
  const apps = await database
    .selectDistinct({
      id: applications.id,
      displayName: applications.displayName,
      iconUrl: applications.iconUrl,
    })
    .from(applications)
    .innerJoin(
      sessions,
      and(
        eq(sessions.appId, applications.id),
        eq(sessions.userId, session.user.id),
      ),
    )
    .orderBy(applications.id);

  return NextResponse.json({ applications: apps });
}
