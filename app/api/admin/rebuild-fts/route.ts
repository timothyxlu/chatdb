// POST /api/admin/rebuild-fts — Rebuild the FTS5 index from all messages.
//
// This re-reads every message, segments Chinese text with Intl.Segmenter,
// and re-inserts into the FTS5 table. Use after running the 0002 migration,
// or whenever you need to re-index.
//
// Auth: Bearer token (same chatdb_tk_… tokens used by MCP / Ingest).

import { NextRequest, NextResponse } from 'next/server';
import { getCfEnv } from '@/lib/cf-env';
import { resolveToken } from '@/lib/token-auth';
import { db } from '@/lib/db';
import { ftsRebuildAll } from '@/lib/fts';

export async function POST(req: NextRequest) {
  const env = await getCfEnv();
  const tokenCtx = await resolveToken(req.headers.get('Authorization'), env.DB);
  if (!tokenCtx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const database = db(env.DB);
  const count = await ftsRebuildAll(database);

  return NextResponse.json({ rebuilt: true, messages_indexed: count });
}
