import { auth } from './auth';
import { NextResponse } from 'next/server';

// Public paths that don't require a session cookie
const PUBLIC_PREFIXES = [
  '/login',
  '/api/auth',      // NextAuth callbacks
  '/api/ingest',    // Bearer token auth (browser extension)
  '/mcp',           // Bearer token auth (MCP server)
  '/.well-known/',  // OAuth server metadata (RFC 8414)
  '/oauth/',        // OAuth endpoints: register, authorize, token
];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  const isPublic = PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (isPublic) return NextResponse.next();

  // Static assets handled separately
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon.ico')) {
    return NextResponse.next();
  }

  // Redirect unauthenticated users to /login
  if (!req.auth) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/signout).*)'],
};
