// GET /api/search?q=...&app=claude&limit=20
// Hybrid keyword + semantic search

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { getCfEnv } from '@/lib/cf-env';
import { hybridSearch } from '@/lib/search';


export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const query = searchParams.get('q')?.trim();
  if (!query) return NextResponse.json({ results: [] });

  const app = searchParams.get('app') ?? undefined;
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 50);

  const env = await getCfEnv();
  const database = db(env.DB);

  const results = await hybridSearch(database, {
    userId: session.user.id,
    query,
    limit,
    appId: app,
    ai: env.AI,
    vectorize: env.VECTORIZE,
  });

  return NextResponse.json({ results, query });
}
