// POST /oauth/token — Authorization Code → Access Token (RFC 6749)
//
// Accepts application/x-www-form-urlencoded (required by spec) and application/json.
// On success the access token is stored in api_tokens and returned as a
// chatdb_tk_… Bearer token, reusing the existing MCP authentication path.

import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getCfEnv } from '@/lib/cf-env';
import { oauthClients, oauthCodes, apiTokens } from '@/lib/schema';
import { sha256hex, s256 } from '@/lib/oauth';
import { generateToken } from '@/lib/token-auth';

function oauthError(error: string, description: string, status = 400) {
  return NextResponse.json({ error, error_description: description }, { status });
}

export async function POST(req: Request) {
  // ── Parse body (form-encoded or JSON) ────────────────────────────────────────
  let grant_type: string | undefined;
  let code: string | undefined;
  let redirect_uri: string | undefined;
  let client_id: string | undefined;
  let client_secret: string | undefined;
  let code_verifier: string | undefined;

  const ct = req.headers.get('content-type') ?? '';
  if (ct.includes('application/x-www-form-urlencoded')) {
    const form = await req.formData();
    const g = (k: string) => form.get(k) as string | null ?? undefined;
    grant_type = g('grant_type');
    code = g('code');
    redirect_uri = g('redirect_uri');
    client_id = g('client_id');
    client_secret = g('client_secret');
    code_verifier = g('code_verifier');
  } else {
    const body = (await req.json().catch(() => ({}))) as Record<string, string>;
    ({ grant_type, code, redirect_uri, client_id, client_secret, code_verifier } = body);
  }

  if (grant_type !== 'authorization_code') {
    return oauthError('unsupported_grant_type', 'Only authorization_code is supported');
  }
  if (!code || !redirect_uri || !client_id) {
    return oauthError('invalid_request', 'Missing required parameters: code, redirect_uri, client_id');
  }

  const env = await getCfEnv();
  const database = db(env.DB);

  // ── Validate client ──────────────────────────────────────────────────────────
  const [client] = await database
    .select()
    .from(oauthClients)
    .where(eq(oauthClients.id, client_id))
    .limit(1);

  if (!client) return oauthError('invalid_client', 'Unknown client_id', 401);

  if (client.clientSecretHash) {
    if (!client_secret) return oauthError('invalid_client', 'client_secret required', 401);
    if ((await sha256hex(client_secret)) !== client.clientSecretHash) {
      return oauthError('invalid_client', 'Invalid client_secret', 401);
    }
  }

  // ── Validate authorization code ──────────────────────────────────────────────
  const [authCode] = await database
    .select()
    .from(oauthCodes)
    .where(eq(oauthCodes.code, code))
    .limit(1);

  if (!authCode || authCode.clientId !== client_id) {
    return oauthError('invalid_grant', 'Invalid authorization code');
  }
  if (authCode.usedAt) {
    return oauthError('invalid_grant', 'Authorization code already used');
  }
  if (Date.now() > authCode.expiresAt) {
    return oauthError('invalid_grant', 'Authorization code expired');
  }
  if (authCode.redirectUri !== redirect_uri) {
    return oauthError('invalid_grant', 'redirect_uri mismatch');
  }

  // ── PKCE verification ────────────────────────────────────────────────────────
  if (authCode.codeChallenge) {
    if (!code_verifier) {
      return oauthError('invalid_grant', 'code_verifier required');
    }
    if ((await s256(code_verifier)) !== authCode.codeChallenge) {
      return oauthError('invalid_grant', 'PKCE verification failed');
    }
  }

  // ── Mark code used (before issuing token — prevents race-condition reuse) ─────
  await database
    .update(oauthCodes)
    .set({ usedAt: Date.now() })
    .where(eq(oauthCodes.code, code));

  // ── Issue access token ───────────────────────────────────────────────────────
  const { rawToken, tokenHash } = await generateToken();
  await database.insert(apiTokens).values({
    id: crypto.randomUUID(),
    userId: authCode.userId,
    name: client.clientName,
    tokenHash,
    createdAt: Date.now(),
  });

  return NextResponse.json({
    access_token: rawToken,
    token_type: 'bearer',
    scope: '',
  });
}
