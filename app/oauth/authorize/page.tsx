// GET /oauth/authorize — OAuth 2.0 Authorization Endpoint
//
// Flow:
//   1. Validate client_id + redirect_uri against registered client.
//   2. If user is not logged in, bounce to /login then back here.
//   3. Show a consent card; "Authorize" issues a code and redirects to the client.

import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getCfEnv } from '@/lib/cf-env';
import { oauthClients } from '@/lib/schema';
import { issueAuthCode } from '@/lib/oauth';

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const { client_id, redirect_uri, response_type, state, code_challenge, code_challenge_method } =
    params;

  // ── Validate basic params ────────────────────────────────────────────────────
  if (response_type !== 'code' || !client_id || !redirect_uri) {
    return <ErrorCard msg="Missing or invalid OAuth parameters (client_id, redirect_uri, response_type=code are required)." />;
  }

  if (code_challenge && code_challenge_method !== 'S256') {
    return <ErrorCard msg="Only code_challenge_method=S256 is supported." />;
  }

  // ── Load and validate client ─────────────────────────────────────────────────
  const env = await getCfEnv();
  const [client] = await db(env.DB)
    .select()
    .from(oauthClients)
    .where(eq(oauthClients.id, client_id))
    .limit(1);

  if (!client) return <ErrorCard msg="Unknown client_id." />;

  const allowedUris: string[] = JSON.parse(client.redirectUris);
  if (!allowedUris.includes(redirect_uri)) {
    return <ErrorCard msg="redirect_uri is not registered for this client." />;
  }

  // ── Require authentication ───────────────────────────────────────────────────
  const session = await auth();
  if (!session?.user?.id) {
    const self =
      `/oauth/authorize?client_id=${encodeURIComponent(client_id)}` +
      `&redirect_uri=${encodeURIComponent(redirect_uri)}` +
      `&response_type=code` +
      (state ? `&state=${encodeURIComponent(state)}` : '') +
      (code_challenge
        ? `&code_challenge=${encodeURIComponent(code_challenge)}&code_challenge_method=S256`
        : '');
    redirect(`/login?callbackUrl=${encodeURIComponent(self)}`);
  }

  // ── Server actions ───────────────────────────────────────────────────────────
  async function handleApprove() {
    'use server';
    const envInner = await getCfEnv();
    const sessionInner = await auth();
    const userId = sessionInner?.user?.id;
    if (!userId) {
      redirect('/login');
      return;
    }

    const code = await issueAuthCode({
      userId,
      clientId: client_id!,
      redirectUri: redirect_uri!,
      codeChallenge: code_challenge ?? null,
      d1: envInner.DB,
    });

    const dest = new URL(redirect_uri!);
    dest.searchParams.set('code', code);
    if (state) dest.searchParams.set('state', state);
    redirect(dest.toString());
  }

  async function handleDeny() {
    'use server';
    const dest = new URL(redirect_uri!);
    dest.searchParams.set('error', 'access_denied');
    if (state) dest.searchParams.set('state', state);
    redirect(dest.toString());
  }

  // ── Consent UI ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-surface-elevated flex items-center justify-center p-6">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-blue-100 to-purple-100 opacity-40 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full bg-gradient-to-tr from-blue-50 to-indigo-100 opacity-30 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-xl shadow-black/10 border border-black/[0.07] p-8">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-xl shadow-lg shadow-blue-600/20">
              💬
            </div>
            <div>
              <h1 className="text-base font-bold text-label-primary">Authorize Access</h1>
              <p className="text-xs text-label-tertiary">ChatDB</p>
            </div>
          </div>

          {/* Description */}
          <p className="text-sm text-label-secondary mb-1">
            <span className="font-semibold text-label-primary">{client.clientName}</span> is
            requesting access to your ChatDB account.
          </p>
          <p className="text-xs text-label-tertiary mb-6">
            This application will be able to read and write your conversation history via the MCP
            API.
          </p>

          {/* Permissions list */}
          <ul className="space-y-2 mb-6">
            {[
              ['📖', 'Read your chat sessions and messages'],
              ['✏️', 'Create and update sessions'],
              ['🔍', 'Search your conversation history'],
            ].map(([icon, text]) => (
              <li key={String(text)} className="flex items-center gap-2 text-sm text-label-secondary">
                <span className="text-base">{icon}</span>
                {text}
              </li>
            ))}
          </ul>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <form action={handleApprove}>
              <button
                type="submit"
                className="w-full bg-label-primary text-white font-semibold text-sm py-2.5 rounded-xl hover:bg-label-primary/90 transition-colors"
              >
                Authorize
              </button>
            </form>
            <form action={handleDeny}>
              <button
                type="submit"
                className="w-full text-sm text-label-secondary py-2.5 rounded-xl hover:bg-black/5 transition-colors"
              >
                Cancel
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

function ErrorCard({ msg }: { msg: string }) {
  return (
    <div className="min-h-screen bg-surface-elevated flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-xl border border-black/[0.07] p-8 max-w-sm w-full">
        <h1 className="text-lg font-semibold text-label-primary mb-2">Authorization Error</h1>
        <p className="text-sm text-label-secondary">{msg}</p>
      </div>
    </div>
  );
}
