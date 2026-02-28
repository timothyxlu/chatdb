import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { db } from '@/lib/db';
import { hybridSearch } from '@/lib/search';

const SearchChatsSchema = z.object({
  query: z.string().min(1).describe('Natural language search query'),
  limit: z.number().int().min(1).max(20).optional().default(10),
  app: z.string().optional().describe('Filter by app ID: "claude", "chatgpt", "gemini"'),
});

export function registerSearchChats(
  server: McpServer,
  context: { userId: string; d1?: D1Database | null; ai?: Ai; vectorize?: VectorizeIndex | null }
) {
  server.tool(
    'search_chats',
    'Hybrid full-text + semantic search across all saved conversations.',
    SearchChatsSchema.shape,
    async (args) => {
      const { query, limit, app } = SearchChatsSchema.parse(args);
      const database = db(context.d1);

      const results = await hybridSearch(database, {
        userId: context.userId,
        query,
        limit,
        appId: app,
        ai: context.ai,
        vectorize: context.vectorize,
      });

      return {
        content: [{ type: 'text', text: JSON.stringify({ results }) }],
      };
    }
  );
}
