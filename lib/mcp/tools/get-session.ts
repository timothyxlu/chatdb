import { z } from 'zod';
import { eq, and, asc } from 'drizzle-orm';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { db } from '@/lib/db';
import { sessions, messages } from '@/lib/schema';

const GetSessionSchema = z.object({
  session_id: z.string().uuid(),
});

export function registerGetSession(
  server: McpServer,
  context: { userId: string; d1?: D1Database | null }
) {
  server.tool(
    'get_session',
    'Retrieve all messages in a specific session.',
    GetSessionSchema.shape,
    async (args) => {
      const { session_id } = GetSessionSchema.parse(args);
      const database = db(context.d1);

      const [session] = await database
        .select()
        .from(sessions)
        .where(and(eq(sessions.id, session_id), eq(sessions.userId, context.userId)))
        .limit(1);

      if (!session) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: 'Session not found' }) }],
          isError: true,
        };
      }

      const msgs = await database
        .select()
        .from(messages)
        .where(eq(messages.sessionId, session_id))
        .orderBy(asc(messages.createdAt));

      return {
        content: [{ type: 'text', text: JSON.stringify({ session, messages: msgs }) }],
      };
    }
  );
}
