// RFC 8414 — OAuth 2.0 Authorization Server Metadata
// MCP clients fetch this to discover endpoints and capabilities.

export function GET(req: Request) {
  const base = new URL(req.url).origin;
  return Response.json({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
  });
}
