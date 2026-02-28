import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ── Users ────────────────────────────────────────────────────────────────────
// Created on first GitHub OAuth login
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),             // GitHub user ID (string)
  githubId: text('github_id').unique().notNull(),
  username: text('username').notNull(),
  avatarUrl: text('avatar_url'),
  createdAt: integer('created_at').notNull(),
});

// ── Applications ─────────────────────────────────────────────────────────────
// Seed data: claude, chatgpt, gemini, other
export const applications = sqliteTable('applications', {
  id: text('id').primaryKey(),             // e.g. "claude", "chatgpt"
  displayName: text('display_name').notNull(),
  iconUrl: text('icon_url'),
});

// ── Sessions ─────────────────────────────────────────────────────────────────
// One conversation
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),             // UUID v4
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  appId: text('app_id')
    .notNull()
    .references(() => applications.id),
  title: text('title'),
  messageCount: integer('message_count').notNull().default(0),
  starred: integer('starred').notNull().default(0),  // 0 = unstarred, 1 = starred
  sourceUrl: text('source_url'),           // for deduplication (ingest API)
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// ── Messages ─────────────────────────────────────────────────────────────────
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),             // UUID v4
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant'] }).notNull(),
  content: text('content').notNull(),
  createdAt: integer('created_at').notNull(),
});

// ── API Tokens ───────────────────────────────────────────────────────────────
// Personal tokens used by MCP clients and browser extensions
export const apiTokens = sqliteTable('api_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),            // e.g. "Claude Desktop"
  tokenHash: text('token_hash').unique().notNull(),  // SHA-256(raw)
  lastUsedAt: integer('last_used_at'),
  createdAt: integer('created_at').notNull(),
  revokedAt: integer('revoked_at'),        // NULL = active
});

// ── OAuth Clients (Dynamic Client Registration — RFC 7591) ────────────────────
export const oauthClients = sqliteTable('oauth_clients', {
  id: text('id').primaryKey(),                      // client_id (UUID)
  clientSecretHash: text('client_secret_hash'),      // SHA-256(secret); null = PKCE-only
  redirectUris: text('redirect_uris').notNull(),     // JSON array
  clientName: text('client_name').notNull(),
  clientUri: text('client_uri'),
  createdAt: integer('created_at').notNull(),
});

// ── OAuth Authorization Codes (short-lived, single-use) ───────────────────────
export const oauthCodes = sqliteTable('oauth_codes', {
  code: text('code').primaryKey(),                   // 48 random hex chars
  clientId: text('client_id')
    .notNull()
    .references(() => oauthClients.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  redirectUri: text('redirect_uri').notNull(),
  codeChallenge: text('code_challenge'),             // PKCE S256 challenge
  expiresAt: integer('expires_at').notNull(),        // unix ms
  usedAt: integer('used_at'),                        // null = unused
});

// ── Types ─────────────────────────────────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type Application = typeof applications.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type ApiToken = typeof apiTokens.$inferSelect;
export type OAuthClient = typeof oauthClients.$inferSelect;
export type OAuthCode = typeof oauthCodes.$inferSelect;

export type NewSession = typeof sessions.$inferInsert;
export type NewMessage = typeof messages.$inferInsert;
export type NewApiToken = typeof apiTokens.$inferInsert;
