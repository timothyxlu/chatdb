// Shared token authentication used by both the MCP server and the Ingest API.
//
// Token format: chatdb_tk_<32 hex chars>
// Storage:      SHA-256(raw_token) stored in api_tokens.token_hash
// Auth header:  Authorization: Bearer chatdb_tk_…

import { eq, and, isNull } from 'drizzle-orm';
import { db } from './db';
import { apiTokens } from './schema';

export interface TokenContext {
  userId: string;
  tokenId: string;
  tokenName: string;  // api_tokens.name — used as the appId in sessions
}

/**
 * Validates an `Authorization: Bearer chatdb_tk_…` header.
 * Returns the resolved userId + tokenId, or null if invalid/revoked.
 * Also updates `last_used_at` on success.
 */
export async function resolveToken(
  authorization: string | null | undefined,
  d1?: D1Database | null
): Promise<TokenContext | null> {
  if (!authorization?.startsWith('Bearer chatdb_tk_')) return null;

  const rawToken = authorization.slice('Bearer '.length);

  // SHA-256 hash using Web Crypto API (works in both Node.js 20+ and edge)
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawToken));
  const tokenHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const database = db(d1);

  const [token] = await database
    .select()
    .from(apiTokens)
    .where(and(eq(apiTokens.tokenHash, tokenHash), isNull(apiTokens.revokedAt)))
    .limit(1);

  if (!token) return null;

  // Fire-and-forget last_used_at update
  database
    .update(apiTokens)
    .set({ lastUsedAt: Date.now() })
    .where(eq(apiTokens.id, token.id))
    .then(() => {})
    .catch(() => {});

  return { userId: token.userId, tokenId: token.id, tokenName: token.name };
}

/**
 * Generate a new API token.
 * Returns { rawToken, tokenHash } — store only the hash; show raw once.
 */
export async function generateToken(): Promise<{ rawToken: string; tokenHash: string }> {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const rawToken = `chatdb_tk_${hex}`;

  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawToken));
  const tokenHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return { rawToken, tokenHash };
}
