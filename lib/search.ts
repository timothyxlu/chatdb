// Hybrid search: FTS5 (keyword) + Vectorize/ChromaDB (semantic)
// Merged with Reciprocal Rank Fusion (RRF)

import { eq, and, inArray, sql } from 'drizzle-orm';
import type { Db } from './db';
import { messages, sessions } from './schema';
import { getEmbedding } from './embed';
import { getVectorClient } from './vector';

export interface SearchResult {
  sessionId: string;
  sessionTitle: string | null;
  appId: string;
  messageId: string;
  role: 'user' | 'assistant';
  content: string;
  snippet: string;          // HTML with <mark> tags for keyword matches
  score: number;            // RRF merged score
  createdAt: number;
}

export interface SearchOptions {
  userId: string;
  query: string;
  limit?: number;
  appId?: string;
  ai?: Ai;
  vectorize?: VectorizeIndex | null;
}

/**
 * Minimum cosine-similarity score for a vector result to be included.
 * bge-m3 cosine scores range from ~0 (unrelated) to 1.0 (identical).
 * Setting this to 0.5 drops clearly-irrelevant neighbours that would
 * otherwise pollute results when the keyword search returns nothing.
 */
const MIN_VECTOR_SCORE = 0.5;

// ── Keyword search via FTS5 ───────────────────────────────────────────────────
async function ftsSearch(
  database: Db,
  opts: { userId: string; query: string; limit: number; appId?: string }
): Promise<Array<{ messageId: string; sessionId: string; snippet: string }>> {
  const { userId, query, limit, appId } = opts;

  // Drizzle doesn't support FTS5 virtual tables natively, so use raw SQL.
  // Use .all() (not .run()) — .run() discards SELECT results in libsql/turso.
  const appFilter = appId ? `AND s.app_id = '${appId.replace(/'/g, "''")}'` : '';

  const rows = await database.all<{ message_id: string; session_id: string; snippet: string }>(sql`
    SELECT
      m.id          AS message_id,
      m.session_id  AS session_id,
      snippet(messages_fts, 0, '<mark>', '</mark>', '…', 24) AS snippet
    FROM   messages_fts fts
    JOIN   messages  m ON m.rowid = fts.rowid
    JOIN   sessions  s ON s.id = m.session_id
    WHERE  messages_fts MATCH ${query}
      AND  s.user_id = ${userId}
      ${sql.raw(appFilter)}
    ORDER  BY rank
    LIMIT  ${limit}
  `);

  return rows.map((r) => ({
    messageId: r.message_id,
    sessionId: r.session_id,
    snippet: r.snippet,
  }));
}

// ── Vector search ─────────────────────────────────────────────────────────────
async function vectorSearch(
  opts: {
    userId: string;
    query: string;
    limit: number;
    appId?: string;
    ai?: Ai;
    vectorize?: VectorizeIndex | null;
  }
): Promise<Array<{ messageId: string; score: number }>> {
  const embedding = await getEmbedding(opts.query, opts.ai);
  const vectorClient = getVectorClient(opts.vectorize);
  const matches = await vectorClient.query(embedding, opts.userId, {
    topK: opts.limit,
    appId: opts.appId,
  });
  return matches
    .filter((m) => m.score >= MIN_VECTOR_SCORE)
    .map((m) => ({ messageId: m.id, score: m.score }));
}

// ── RRF merge ────────────────────────────────────────────────────────────────
function rrfMerge(
  ftsResults: Array<{ messageId: string; snippet: string }>,
  vecResults: Array<{ messageId: string; score: number }>,
  k = 60
): Map<string, { rrfScore: number; snippet: string }> {
  const scores = new Map<string, { rrfScore: number; snippet: string }>();

  ftsResults.forEach((r, rank) => {
    const existing = scores.get(r.messageId) ?? { rrfScore: 0, snippet: r.snippet };
    existing.rrfScore += 1 / (k + rank + 1);
    existing.snippet = r.snippet; // FTS snippet has <mark> tags, prefer it
    scores.set(r.messageId, existing);
  });

  vecResults.forEach((r, rank) => {
    const existing = scores.get(r.messageId) ?? { rrfScore: 0, snippet: '' };
    existing.rrfScore += 1 / (k + rank + 1);
    scores.set(r.messageId, existing);
  });

  return scores;
}

// ── Main hybrid search ────────────────────────────────────────────────────────
export async function hybridSearch(
  database: Db,
  opts: SearchOptions
): Promise<SearchResult[]> {
  const limit = opts.limit ?? 20;

  // Run FTS and vector search in parallel
  const [ftsRaw, vecRaw] = await Promise.all([
    ftsSearch(database, { ...opts, limit }).catch((err) => {
      console.error('[search] FTS error:', err);
      return [] as Array<{ messageId: string; sessionId: string; snippet: string }>;
    }),
    vectorSearch({ ...opts, limit }).catch((err) => {
      console.error('[search] Vector error:', err);
      return [] as Array<{ messageId: string; score: number }>;
    }),
  ]);

  // Merge with RRF
  const merged = rrfMerge(ftsRaw, vecRaw);
  if (merged.size === 0) return [];

  // Fetch full message + session data for matched IDs
  const messageIds = [...merged.keys()].slice(0, limit);
  const rows = await database
    .select({
      messageId: messages.id,
      sessionId: sessions.id,
      sessionTitle: sessions.title,
      appId: sessions.appId,
      role: messages.role,
      content: messages.content,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .innerJoin(sessions, eq(messages.sessionId, sessions.id))
    .where(and(inArray(messages.id, messageIds), eq(sessions.userId, opts.userId)));

  // Map rows and sort by RRF score descending
  return rows
    .map((row) => {
      const mergedData = merged.get(row.messageId) ?? { rrfScore: 0, snippet: '' };
      return {
        sessionId: row.sessionId,
        sessionTitle: row.sessionTitle,
        appId: row.appId,
        messageId: row.messageId,
        role: row.role as 'user' | 'assistant',
        content: row.content,
        snippet: mergedData.snippet || row.content.slice(0, 200),
        score: mergedData.rrfScore,
        createdAt: row.createdAt,
      };
    })
    .sort((a, b) => b.score - a.score);
}
