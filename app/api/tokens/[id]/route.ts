// DELETE /api/tokens/[id] — revoke a token

import { NextRequest, NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { getCfEnv } from '@/lib/cf-env';
import { apiTokens } from '@/lib/schema';


export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const env = await getCfEnv();
  const database = db(env.DB);

  const [token] = await database
    .select()
    .from(apiTokens)
    .where(and(eq(apiTokens.id, id), eq(apiTokens.userId, session.user.id)))
    .limit(1);

  if (!token) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // If already revoked, permanently delete; otherwise soft-revoke.
  if (token.revokedAt) {
    await database.delete(apiTokens).where(eq(apiTokens.id, id));
    return NextResponse.json({ deleted: id });
  }

  await database
    .update(apiTokens)
    .set({ revokedAt: Date.now() })
    .where(eq(apiTokens.id, id));

  return NextResponse.json({ revoked: id });
}
