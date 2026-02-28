import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { db } from '@/lib/db';
import { messages, sessions } from '@/lib/schema';
import { getEmbedding } from '@/lib/embed';
import { getVectorClient } from '@/lib/vector';

const AddMessageSchema = z.object({
  session_id: z.string().uuid(),
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1),
  created_at: z.number().optional().describe('Unix timestamp (seconds)'),
});

export function registerAddMessage(
  server: McpServer,
  context: { userId: string; d1?: D1Database | null; ai?: Ai; vectorize?: VectorizeIndex | null }
) {
  server.tool(
    'add_message',
    'Append a single message (user or assistant turn) to an existing session created by create_session. ' +
    'Call this once for each message in the conversation — every user and assistant message must be saved.',
    AddMessageSchema.shape,
    async (args) => {
      const { session_id, role, content, created_at } = AddMessageSchema.parse(args);
      const database = db(context.d1);
      const now = Date.now();
      const msgId = crypto.randomUUID();
      const createdAt = created_at ? created_at * 1000 : now;

      // Verify session belongs to this user
      const [session] = await database
        .select()
        .from(sessions)
        .where(eq(sessions.id, session_id))
        .limit(1);

      if (!session || session.userId !== context.userId) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: 'Session not found' }) }],
          isError: true,
        };
      }

      await database.insert(messages).values({ id: msgId, sessionId: session_id, role, content, createdAt });

      // Update session counters
      await database
        .update(sessions)
        .set({ messageCount: sql`${sessions.messageCount} + 1`, updatedAt: now })
        .where(eq(sessions.id, session_id));

      // Embed and upsert vector
      try {
        const values = await getEmbedding(content, context.ai);
        await getVectorClient(context.vectorize).upsert([
          {
            id: msgId,
            values,
            metadata: { messageId: msgId, sessionId: session_id, userId: context.userId, appId: session.appId, role, createdAt },
          },
        ]);
      } catch {
        // Non-fatal
      }

      return {
        content: [{ type: 'text', text: JSON.stringify({ message_id: msgId, session_id }) }],
      };
    }
  );
}
