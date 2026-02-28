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
  const response = NextResponse.redirect(url);

  response.cookies.delete('__Secure-authjs.session-token');
  response.cookies.delete('__Host-authjs.csrf-token');
  response.cookies.delete('authjs.session-token');
  response.cookies.delete('authjs.csrf-token');

  return response;
}
