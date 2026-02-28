import { drizzle as drizzleD1 } from 'drizzle-orm/d1';
import * as schema from './schema';

// The canonical Db type — D1 drizzle instance with our schema
export type Db = ReturnType<typeof drizzleD1<typeof schema>>;

// Drizzle instance for Cloudflare D1 (production)
export function getDb(d1: D1Database): Db {
  return drizzleD1(d1, { schema });
}

// Drizzle instance for local SQLite via @libsql/client (WASM — no native build needed)
// Uses require() so the module is never bundled into edge worker output
let _localDb: Db | null = null;
export function getLocalDb(): Db {
  if (_localDb) return _localDb;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createClient } = require('@libsql/client');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { drizzle } = require('drizzle-orm/libsql');
  const url = process.env.SQLITE_PATH ?? 'file:./local.db';
  const client = createClient({ url });
  _localDb = drizzle(client, { schema }) as unknown as Db;
  return _localDb;
}

// Unified accessor — pass D1 in production, omit for local dev
export function db(d1?: D1Database | null): Db {
  if (d1) return getDb(d1);
  return getLocalDb();
}
