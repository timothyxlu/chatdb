import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { db } from '@/lib/db';
import { sessions, messages, applications } from '@/lib/schema';
import { getEmbedding } from '@/lib/embed';
import { getVectorClient } from '@/lib/vector';

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']).describe('Who sent this message'),
  content: z.string().min(1).describe('The full text content of this message'),
  created_at: z.number().optional().describe('Unix timestamp in seconds when the message was sent'),
});

const SaveSessionSchema = z.object({
  messages: z
    .array(MessageSchema)
    .min(1)
    .describe(
      'The COMPLETE list of all messages in the current conversation, in chronological order. ' +
      'Include every user message and every assistant response from the entire chat session — do not omit or summarize any messages.'
    ),
  title: z.string().optional().describe('Short conversation title (auto-derived from first user message if omitted)'),
});

export function registerSaveSession(
  server: McpServer,
  context: { userId: string; clientName: string; d1?: D1Database | null; ai?: Ai; vectorize?: VectorizeIndex | null }
) {
  server.tool(
    'save_session',
    'Save the entire current conversation to the chat history database. ' +
    'You MUST include ALL messages (both user and assistant) from this chat session in the messages array, in chronological order. ' +
    'Do not omit, truncate, or summarize any messages. Returns the new session_id.',
    SaveSessionSchema.shape,
    async (args) => {
      const { messages: msgs, title } = SaveSessionSchema.parse(args);

      const database = db(context.d1);
      const now = Date.now();
      const sessionId = crypto.randomUUID();

      // Register the client as an application if not already present
      await database
        .insert(applications)
        .values({ id: context.clientName, displayName: context.clientName })
        .onConflictDoNothing();

      const derivedTitle =
        title ?? msgs.find((m) => m.role === 'user')?.content.slice(0, 80) ?? 'Untitled';

      // Insert session
      await database.insert(sessions).values({
        id: sessionId,
        userId: context.userId,
        appId: context.clientName,
        title: derivedTitle,
        messageCount: msgs.length,
        createdAt: now,
        updatedAt: now,
      });

      // Insert messages + build embedding records
      const vectorRecords = [];
      for (const msg of msgs) {
        const msgId = crypto.randomUUID();
        const createdAt = msg.created_at ? msg.created_at * 1000 : now;

        await database.insert(messages).values({
          id: msgId,
          sessionId,
          role: msg.role,
          content: msg.content,
          createdAt,
        });

        // Embed and queue for vector upsert
        try {
          const values = await getEmbedding(msg.content, context.ai);
          vectorRecords.push({
            id: msgId,
            values,
            metadata: {
              messageId: msgId,
              sessionId,
              userId: context.userId,
              appId: context.clientName,
              role: msg.role,
              createdAt,
            },
          });
        } catch {
          // Embedding failure is non-fatal — keyword search still works
        }
      }

      // Upsert vectors
      if (vectorRecords.length > 0) {
        try {
          await getVectorClient(context.vectorize).upsert(vectorRecords);
        } catch {
          // Vector upsert failure is non-fatal
        }
      }

      return {
        content: [{ type: 'text', text: JSON.stringify({ session_id: sessionId, message_count: msgs.length }) }],
      };
    }
  );
}
