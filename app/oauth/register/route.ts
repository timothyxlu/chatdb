// POST /oauth/register — Dynamic Client Registration (RFC 7591)
// MCP clients call this once to obtain client_id + client_secret.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCfEnv } from '@/lib/cf-env';
import { oauthClients } from '@/lib/schema';
import { sha256hex } from '@/lib/oauth';

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'invalid_client_metadata', error_description: 'Expected JSON body' },
      { status: 400 },
    );
  }

  const redirectUris = body.redirect_uris as string[] | undefined;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    return NextResponse.json(
      { error: 'invalid_redirect_uri', error_description: 'redirect_uris is required' },
      { status: 400 },
    );
  }

  const clientName = ((body.client_name as string | undefined) ?? '').trim() || 'MCP Client';
  const clientUri = (body.client_uri as string | undefined) ?? null;

  const clientId = crypto.randomUUID();
  const secretBytes = new Uint8Array(32);
  crypto.getRandomValues(secretBytes);
  const clientSecret = Array.from(secretBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const clientSecretHash = await sha256hex(clientSecret);

  const env = await getCfEnv();
  await db(env.DB).insert(oauthClients).values({
    id: clientId,
    clientSecretHash,
    redirectUris: JSON.stringify(redirectUris),
    clientName,
    clientUri,
    createdAt: Date.now(),
  });

  return NextResponse.json(
    {
      client_id: clientId,
      client_secret: clientSecret,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: clientName,
      redirect_uris: redirectUris,
      token_endpoint_auth_method: 'client_secret_post',
      grant_types: ['authorization_code'],
      response_types: ['code'],
    },
    { status: 201 },
  );
}
