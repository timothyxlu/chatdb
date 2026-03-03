// GET  /api/ingest/lookup?source_url=…  — check if a URL has been ingested
// POST /api/ingest/lookup               — batch check multiple URLs
//
// Auth: Authorization: Bearer chatdb_tk_…

import { NextRequest, NextResponse } from 'next/server';
import { eq, and, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getCfEnv } from '@/lib/cf-env';
import { resolveToken } from '@/lib/token-auth';
import { sessions } from '@/lib/schema';

// ── GET — single URL lookup ─────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const env = await getCfEnv();
  const tokenCtx = await resolveToken(req.headers.get('Authorization'), env.DB);
  if (!tokenCtx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sourceUrl = req.nextUrl.searchParams.get('source_url');
  if (!sourceUrl) {
    return NextResponse.json({ error: 'Missing source_url query parameter' }, { status: 400 });
  }

  const database = db(env.DB);
  const [row] = await database
    .select({
      id: sessions.id,
      sourceUrl: sessions.sourceUrl,
      scrapedAt: sessions.scrapedAt,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, tokenCtx.userId), eq(sessions.sourceUrl, sourceUrl)))
    .limit(1);

  if (!row) {
    return NextResponse.json({ exists: false });
  }

  return NextResponse.json({
    exists: true,
    session_id: row.id,
    source_url: row.sourceUrl,
    scraped_at: row.scrapedAt,
  });
}

// ── POST — batch URL lookup ─────────────────────────────────────────────────

const BatchSchema = z.object({
  source_urls: z.array(z.string().url()).min(1).max(100),
});

export async function POST(req: NextRequest) {
  const env = await getCfEnv();
  const tokenCtx = await resolveToken(req.headers.get('Authorization'), env.DB);
  if (!tokenCtx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: z.infer<typeof BatchSchema>;
  try {
    body = BatchSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request body', details: String(err) }, { status: 400 });
  }

  const database = db(env.DB);
  const rows = await database
    .select({
      id: sessions.id,
      sourceUrl: sessions.sourceUrl,
      scrapedAt: sessions.scrapedAt,
    })
    .from(sessions)
    .where(
      and(eq(sessions.userId, tokenCtx.userId), inArray(sessions.sourceUrl, body.source_urls))
    );

  const results: Record<string, { session_id: string; scraped_at: number | null } | null> = {};
  for (const url of body.source_urls) {
    const match = rows.find((r) => r.sourceUrl === url);
    results[url] = match ? { session_id: match.id, scraped_at: match.scrapedAt } : null;
  }

  return NextResponse.json({ results });
}
