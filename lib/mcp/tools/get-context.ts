import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { db } from '@/lib/db';
import { sessions, messages } from '@/lib/schema';

const GetContextSchema = z.object({
  limit: z.number().int().min(1).max(50).optional().default(10)
    .describe('Number of most recent messages to return'),
  app: z.string().optional().describe('Filter by app ID'),
});

export function registerGetContext(
  server: McpServer,
  context: { userId: string; d1?: D1Database | null }
) {
  server.tool(
    'get_recent_context',
    'Return the N most recent messages across all sessions (useful for injecting into system prompts).',
    GetContextSchema.shape,
    async (args) => {
      const { limit, app } = GetContextSchema.parse(args);
      const database = db(context.d1);

      const sessionConditions = [eq(sessions.userId, context.userId)];
      if (app) sessionConditions.push(eq(sessions.appId, app));

      // Get recent sessions
      const recentSessions = await database
        .select({ id: sessions.id, title: sessions.title, appId: sessions.appId })
        .from(sessions)
        .where(and(...sessionConditions))
        .orderBy(desc(sessions.updatedAt))
        .limit(10);

      if (recentSessions.length === 0) {
        return { content: [{ type: 'text', text: JSON.stringify({ messages: [] }) }] };
      }

      // Get most recent messages across those sessions
      const sessionIds = recentSessions.map((s) => s.id);
      const msgs = await database
        .select({
          id: messages.id,
          sessionId: messages.sessionId,
          role: messages.role,
          content: messages.content,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(
          // SQLite: WHERE session_id IN (...)
          and(eq(sessions.userId, context.userId))
        )
        .innerJoin(sessions, eq(messages.sessionId, sessions.id))
        .orderBy(desc(messages.createdAt))
        .limit(limit);

      const sessionMap = Object.fromEntries(recentSessions.map((s) => [s.id, s]));
      const result = msgs.map((m) => ({
        ...m,
        sessionTitle: sessionMap[m.sessionId]?.title,
        appId: sessionMap[m.sessionId]?.appId,
      }));

      return {
        content: [{ type: 'text', text: JSON.stringify({ messages: result }) }],
      };
    }
  );
}
