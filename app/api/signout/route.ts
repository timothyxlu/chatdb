import { NextResponse } from 'next/server';

/**
 * Dedicated signout route excluded from the auth middleware matcher.
 *
 * NextAuth's auth() middleware wrapper refreshes the session cookie on every
 * request. On Cloudflare Workers the refreshed Set-Cookie header arrives after
 * the clearing one, so the session is never deleted. By routing signout through
 * a path the middleware never touches, we avoid the duplicate-header race.
 */
export async function POST(request: Request) {
  const url = new URL('/login', request.url);
  // 303 See Other — changes POST to GET for the redirect
  const response = NextResponse.redirect(url, 303);

  // cookies.delete() omits Secure/HttpOnly/SameSite attributes, but
  // __Secure- prefixed cookies REQUIRE Secure — the browser silently
  // ignores the Set-Cookie if it's missing. Use set() with explicit attrs.
  const clear = { value: '', maxAge: 0, path: '/', secure: true, httpOnly: true, sameSite: 'lax' as const };
  response.cookies.set('__Secure-authjs.session-token', '', clear);
  response.cookies.set('__Host-authjs.csrf-token', '', clear);
  // Dev (HTTP) variants
  response.cookies.set('authjs.session-token', '', { ...clear, secure: false });
  response.cookies.set('authjs.csrf-token', '', { ...clear, secure: false });

  return response;
}
