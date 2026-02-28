// GET  /api/tokens — list API tokens (metadata only, never the raw token)
// POST /api/tokens — create a new API token (raw token shown once)

import { NextRequest, NextResponse } from 'next/server';
import { eq, isNull } from 'drizzle-orm';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { getCfEnv } from '@/lib/cf-env';
import { apiTokens } from '@/lib/schema';
import { generateToken } from '@/lib/token-auth';


export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const env = await getCfEnv();
  const database = db(env.DB);

  const tokens = await database
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      lastUsedAt: apiTokens.lastUsedAt,
      createdAt: apiTokens.createdAt,
      revokedAt: apiTokens.revokedAt,
    })
    .from(apiTokens)
    .where(eq(apiTokens.userId, session.user.id))
    .orderBy(apiTokens.createdAt);

  return NextResponse.json({ tokens });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as Record<string, string>;
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const { rawToken, tokenHash } = await generateToken();
  const tokenId = crypto.randomUUID();
  const now = Date.now();

  const env = await getCfEnv();
  const database = db(env.DB);

  await database.insert(apiTokens).values({
    id: tokenId,
    userId: session.user.id,
    name,
    tokenHash,
    createdAt: now,
  });

  // Return the raw token ONCE — it cannot be retrieved again
  return NextResponse.json(
    {
      id: tokenId,
      name,
      token: rawToken,     // ← show once, store nowhere
      createdAt: now,
    },
    { status: 201 }
  );
}
