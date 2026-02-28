import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSaveSession } from './tools/save-session';
import { registerCreateSession } from './tools/create-session';
import { registerAddMessage } from './tools/add-message';
import { registerSearchChats } from './tools/search-chats';
import { registerListSessions } from './tools/list-sessions';
import { registerGetSession } from './tools/get-session';
import { registerGetContext } from './tools/get-context';

export interface McpContext {
  userId: string;
  clientName: string;  // from api_tokens.name — used as the appId for new sessions
  d1?: D1Database | null;
  ai?: Ai;
  vectorize?: VectorizeIndex | null;
}

/**
 * Creates a fully configured MCP server instance for a specific authenticated user.
 * A new server instance is created per request (stateless).
 */
export function createMcpServer(context: McpContext): McpServer {
  const server = new McpServer({
    name: 'chatdb',
    version: '1.0.0',
  });

  // Register all tools with user-scoped context
  registerSaveSession(server, context);
  registerCreateSession(server, context);
  registerAddMessage(server, context);
  registerSearchChats(server, context);
  registerListSessions(server, context);
  registerGetSession(server, context);
  registerGetContext(server, context);

  return server;
}
