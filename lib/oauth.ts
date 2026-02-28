// OAuth 2.0 helpers shared by registration, authorization, and token endpoints.

import { db } from './db';
import { oauthCodes } from './schema';

/** SHA-256 hex digest — works in both Node.js 20+ and edge runtime. */
export async function sha256hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * PKCE S256 challenge: base64url(SHA-256(verifier))
 * Used to verify code_verifier at the token endpoint.
 */
export async function s256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  );
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Persist a new authorization code and return its value.
 * The code expires in 10 minutes and can only be used once.
 */
export async function issueAuthCode({
  userId,
  clientId,
  redirectUri,
  codeChallenge,
  d1,
}: {
  userId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge?: string | null;
  d1?: D1Database | null;
}): Promise<string> {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const code = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  await db(d1).insert(oauthCodes).values({
    code,
    clientId,
    userId,
    redirectUri,
    codeChallenge: codeChallenge ?? null,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 min
  });

  return code;
}
