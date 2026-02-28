import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { db } from '@/lib/db';
import { sessions, applications } from '@/lib/schema';

const CreateSessionSchema = z.object({
  title: z.string().optional().describe('Conversation title'),
});

export function registerCreateSession(
  server: McpServer,
  context: { userId: string; clientName: string; d1?: D1Database | null }
) {
  server.tool(
    'create_session',
    'Open a new empty session for streaming/incremental saving. ' +
    'After creating, call add_message for EVERY message in the conversation (both user and assistant turns). ' +
    'Returns the session_id to use with add_message.',
    CreateSessionSchema.shape,
    async (args) => {
      const { title } = CreateSessionSchema.parse(args);
      const database = db(context.d1);
      const now = Date.now();
      const sessionId = crypto.randomUUID();

      // Register the client as an application if not already present
      await database
        .insert(applications)
        .values({ id: context.clientName, displayName: context.clientName })
        .onConflictDoNothing();

      await database.insert(sessions).values({
        id: sessionId,
        userId: context.userId,
        appId: context.clientName,
        title: title ?? null,
        messageCount: 0,
        createdAt: now,
        updatedAt: now,
      });

      return {
        content: [{ type: 'text', text: JSON.stringify({ session_id: sessionId }) }],
      };
    }
  );
}
