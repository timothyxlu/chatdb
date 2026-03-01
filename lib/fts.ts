// FTS5 sync — application-layer insert / delete / rebuild.
// We manage FTS ourselves (instead of SQLite triggers) so we can
// pre-segment Chinese text with Intl.Segmenter before indexing.

import { sql } from 'drizzle-orm';
import type { Db } from './db';
import { messages } from './schema';
import { segmentText } from './tokenize';

/** Insert a single message into the FTS5 index (with segmentation). */
export async function ftsInsert(database: Db, messageId: string, content: string): Promise<void> {
  const segmented = segmentText(content);
  await database.run(sql`
    INSERT INTO messages_fts (content, message_id) VALUES (${segmented}, ${messageId})
  `);
}

/** Delete a message from the FTS5 index. */
export async function ftsDelete(database: Db, messageId: string): Promise<void> {
  await database.run(sql`
    DELETE FROM messages_fts WHERE message_id = ${messageId}
  `);
}

/**
 * Rebuild the entire FTS5 index from all messages.
 * Reads messages in batches, segments content, and inserts into FTS.
 * Suitable for post-migration or maintenance use.
 *
 * Returns the number of messages indexed.
 */
export async function ftsRebuildAll(database: Db): Promise<number> {
  // Clear the FTS table
  await database.run(sql`DELETE FROM messages_fts`);

  const BATCH = 500;
  let offset = 0;
  let total = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const rows = await database
      .select({ id: messages.id, content: messages.content })
      .from(messages)
      .limit(BATCH)
      .offset(offset);

    if (rows.length === 0) break;

    for (const row of rows) {
      await ftsInsert(database, row.id, row.content);
    }

    total += rows.length;
    offset += BATCH;
  }

  return total;
}
