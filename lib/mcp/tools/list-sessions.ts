import { z } from 'zod';
import { eq, and, desc, gte } from 'drizzle-orm';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { db } from '@/lib/db';
import { sessions } from '@/lib/schema';

const ListSessionsSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().default(20),
  app: z.string().optional().describe('Filter by app ID'),
  since: z.string().optional().describe('ISO 8601 date — return sessions updated after this time'),
  starred: z.boolean().optional().describe('When true, return only starred sessions'),
});

export function registerListSessions(
  server: McpServer,
  context: { userId: string; d1?: D1Database | null }
) {
  server.tool(
    'list_sessions',
    'List recent conversation sessions with metadata.',
    ListSessionsSchema.shape,
    async (args) => {
      const { limit, app, since, starred } = ListSessionsSchema.parse(args);
      const database = db(context.d1);

      const conditions = [eq(sessions.userId, context.userId)];
      if (app) conditions.push(eq(sessions.appId, app));
      if (starred) conditions.push(eq(sessions.starred, 1));
      if (since) {
        const sinceMs = new Date(since).getTime();
        if (!isNaN(sinceMs)) conditions.push(gte(sessions.updatedAt, sinceMs));
      }

      const rows = await database
        .select()
        .from(sessions)
        .where(and(...conditions))
        .orderBy(desc(sessions.updatedAt))
        .limit(limit);

      return {
        content: [{ type: 'text', text: JSON.stringify({ sessions: rows }) }],
      };
    }
  );
}
