// MCP server endpoint using the Streamable HTTP transport (MCP spec 2025-03-26).
// Both GET (SSE) and POST (JSON-RPC) requests are handled here.
//
// Claude Desktop config:
//   { "type": "http", "url": "https://chatdb.example.com/mcp",
//     "headers": { "Authorization": "Bearer chatdb_tk_…" } }
//
// Authentication: Bearer token in Authorization header (same token as Ingest API).

import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { resolveToken } from '@/lib/token-auth';
import { createMcpServer } from '@/lib/mcp/server';


async function getCloudflareEnv() {
  if (process.env.NODE_ENV !== 'production') return {};
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    return (await getCloudflareContext()).env as {
      DB?: D1Database;
      AI?: Ai;
      VECTORIZE?: VectorizeIndex;
    };
  } catch {
    return {};
  }
}

async function handleRequest(req: Request): Promise<Response> {
  // 1. Authenticate
  const authHeader = req.headers.get('Authorization');
  const env = await getCloudflareEnv();
  const tokenCtx = await resolveToken(authHeader, env.DB);

  if (!tokenCtx) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized — provide Authorization: Bearer chatdb_tk_…' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 2. Create per-request MCP server
  const server = createMcpServer({
    userId: tokenCtx.userId,
    clientName: tokenCtx.tokenName,
    d1: env.DB,
    ai: env.AI,
    vectorize: env.VECTORIZE,
  });

  // 3. Streamable HTTP transport — stateless per request (web-standard for edge runtime)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode
    enableJsonResponse: true,
  });

  await server.connect(transport);

  // 4. Let the transport handle the raw Request → Response
  return transport.handleRequest(req);
}

export const GET = handleRequest;
export const POST = handleRequest;
export const DELETE = handleRequest;
