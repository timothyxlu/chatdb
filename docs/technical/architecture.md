# ChatDB — System Architecture

## Overview

ChatDB is a Next.js web application that stores, browses, and searches AI conversation history. There are three distinct actors:

| Actor | Interface | Purpose |
|---|---|---|
| **AI apps with MCP support** (e.g. Claude Desktop) | MCP server | Save conversations natively; retrieve past context |
| **Browser extension** | REST Ingest API | Scrape and upload chats from web-based AI apps (Gemini, ChatGPT web, etc.) |
| **Human users** | Web UI | Browse, read, and search conversation history |

### Two write paths

- **MCP** — for AI clients that support MCP natively. The client calls `save_session` or `add_message` tools directly during or after a conversation.
- **Ingest API** — for web-based AI apps where no MCP integration is possible. A browser extension scrapes the conversation from the page DOM and POSTs it to `/api/ingest` using a personal API token. Same token format as MCP.

Both paths share the same token auth, the same DB schema, and the same embedding pipeline.

The database layer is environment-aware:
- **Local development**: SQLite (via `better-sqlite3`) + ChromaDB
- **Production (Cloudflare)**: D1 (SQLite-compatible) + Vectorize

---

## High-Level Architecture

```
  Claude Desktop              Browser Extension           Human User (browser)
  (MCP native client)         (Gemini / ChatGPT web)
        │                           │                           │
        │  MCP / HTTP+SSE           │  POST /api/ingest         │  HTTPS
        │  Bearer chatdb_tk_…        │  Bearer chatdb_tk_…        │  session cookie
        ▼                           ▼                           ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                              Next.js App                                  │
│                                                                           │
│  ┌─────────────────────┐  ┌──────────────────┐  ┌──────────────────────┐ │
│  │     MCP Server      │  │   Ingest API     │  │    Web API + UI      │ │
│  │   /mcp/sse (GET)    │  │  /api/ingest     │  │  /api/chats (list)   │ │
│  │   /mcp/messages     │  │  (POST)          │  │  /api/chats/[id]     │ │
│  │   (POST)            │  │                  │  │  /api/search         │ │
│  │                     │  │  Accepts full    │  │  /api/tokens         │ │
│  │   Tools:            │  │  conversation    │  │                      │ │
│  │   • save_session    │  │  JSON uploaded   │  │  Pages:              │ │
│  │   • add_message     │  │  by extension    │  │  • Login             │ │
│  │   • search_chats    │  │                  │  │  • Chat List         │ │
│  │   • list_sessions   │  │                  │  │  • Chat Detail       │ │
│  │   • get_session     │  │                  │  │  • Search            │ │
│  │   • get_context     │  │                  │  │  • Settings          │ │
│  └──────────┬──────────┘  └────────┬─────────┘  └──────────┬───────────┘ │
│             │                      │                        │             │
│  ┌──────────▼──────────────────────▼────────────────────────▼──────────┐ │
│  │                     Data Access Layer (DAL)                          │ │
│  │              lib/db.ts · lib/vector.ts · lib/embed.ts                │ │
│  └──────────────────────┬──────────────────────────┬────────────────────┘ │
└─────────────────────────┼──────────────────────────┼──────────────────────┘
                          │                          │
              ┌───────────▼──────────┐  ┌────────────▼────────────┐
              │    Relational DB     │  │      Vector Store        │
              │                      │  │                          │
              │ local: SQLite file   │  │ local: ChromaDB          │
              │ prod:  Cloudflare D1 │  │ prod:  CF Vectorize      │
              └──────────────────────┘  └──────────────────────────┘
```

---

## Typical Data Flows

### 1. AI app saves a conversation (via MCP)

```
User finishes chatting with Claude
  → Claude calls MCP tool: save_session
      { app: "claude", title: "...", messages: [...] }
  → MCP handler authenticates token → resolves user_id
  → Inserts session + messages into D1/SQLite
  → Embeds each message → upserts into Vectorize/ChromaDB
  → Returns { session_id }
```

### 2. AI app retrieves past context (via MCP)

```
User starts new conversation, asks "like we discussed before..."
  → AI app calls MCP tool: search_chats
      { query: "cloudflare d1 setup", limit: 5 }
  → Hybrid search (FTS5 + vector) scoped to user_id
  → Returns ranked message snippets with session metadata
  → AI uses results as context for the new conversation
```

### 3. Browser extension uploads a conversation (via Ingest API)

```
User finishes chatting on Gemini Web
  → Browser extension scrapes DOM → builds conversation JSON
  → POST /api/ingest
      Authorization: Bearer chatdb_tk_…
      { app: "gemini", title: "...", messages: [...] }
  → Ingest handler authenticates token → resolves user_id
  → Inserts session + messages into D1/SQLite
  → Embeds each message → upserts into Vectorize/ChromaDB
  → Returns { session_id, message_count }
```

### 4. Human browses history (via web UI)

```
User opens chatdb.example.com
  → GitHub OAuth login → session cookie
  → Web UI fetches /api/chats → renders paginated list
  → User clicks a session → /api/chats/[id] → full message view
  → User searches → /api/search?q=... → highlighted results
```

---

## Tech Stack

| Layer | Library / Service |
|---|---|
| Framework | Next.js 15 (App Router) |
| Auth (web) | NextAuth.js v5 — GitHub OAuth, session cookie |
| Auth (MCP) | Bearer token — `api_tokens` table |
| ORM | Drizzle ORM |
| Relational DB (local) | SQLite via `better-sqlite3` |
| Relational DB (prod) | Cloudflare D1 |
| Vector DB (local) | ChromaDB (Docker) |
| Vector DB (prod) | Cloudflare Vectorize |
| Embeddings | Cloudflare Workers AI — `@cf/baai/bge-base-en-v1.5` (768 dims) |
| MCP SDK | `@modelcontextprotocol/sdk` |
| Styling | Tailwind CSS |
| Deployment | Cloudflare Pages + Workers |

---

## Database Schema

### Relational (SQLite / D1)

```sql
-- Users (created on first GitHub login)
CREATE TABLE users (
  id           TEXT PRIMARY KEY,        -- GitHub user ID
  github_id    TEXT UNIQUE NOT NULL,
  username     TEXT NOT NULL,
  avatar_url   TEXT,
  created_at   INTEGER NOT NULL         -- Unix ms
);

-- Known AI applications
CREATE TABLE applications (
  id           TEXT PRIMARY KEY,        -- e.g. "claude", "chatgpt", "gemini"
  display_name TEXT NOT NULL,
  icon_url     TEXT
);

-- One conversation session
CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,       -- UUID
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  app_id        TEXT NOT NULL REFERENCES applications(id),
  title         TEXT,                   -- derived from first user message
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

-- Individual messages
CREATE TABLE messages (
  id          TEXT PRIMARY KEY,         -- UUID
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

-- OAuth clients (registered via Dynamic Client Registration)
CREATE TABLE oauth_clients (
  id                 TEXT PRIMARY KEY,    -- client_id (UUID)
  client_secret_hash TEXT,               -- SHA-256(secret); NULL = PKCE-only
  redirect_uris      TEXT NOT NULL,      -- JSON array
  client_name        TEXT NOT NULL,      -- display name from DCR
  client_uri         TEXT,
  created_at         INTEGER NOT NULL
);

-- OAuth authorization codes (single-use, 10-min expiry)
CREATE TABLE oauth_codes (
  code           TEXT PRIMARY KEY,       -- 48 hex chars
  client_id      TEXT NOT NULL REFERENCES oauth_clients(id),
  user_id        TEXT NOT NULL REFERENCES users(id),
  redirect_uri   TEXT NOT NULL,
  code_challenge TEXT,                   -- PKCE S256 challenge
  expires_at     INTEGER NOT NULL,
  used_at        INTEGER                 -- NULL = unused
);

-- API tokens (issued via OAuth or created manually in Settings)
CREATE TABLE api_tokens (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,           -- e.g. "Claude Desktop" (from oauth_clients.client_name)
  token_hash   TEXT UNIQUE NOT NULL,    -- SHA-256(raw_token)
  last_used_at INTEGER,
  created_at   INTEGER NOT NULL,
  revoked_at   INTEGER                  -- NULL = active
);

-- FTS5 index for keyword search
CREATE VIRTUAL TABLE messages_fts USING fts5(
  content,
  content='messages',
  content_rowid='rowid'
);

-- Auto-sync FTS on insert/delete
CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, content) VALUES (new.rowid, new.content);
END;
CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content)
  VALUES ('delete', old.rowid, old.content);
END;
```

### Vector Store

Each message is embedded and stored scoped to the owning user:

```json
{
  "id":     "<message UUID>",
  "values": [0.021, -0.134, ...],
  "metadata": {
    "message_id": "<UUID>",
    "session_id": "<UUID>",
    "user_id":    "<github-user-id>",
    "app_id":     "claude",
    "role":       "user",
    "created_at": 1709000000000
  }
}
```

Namespace / ChromaDB collection is scoped per `user_id` — vectors from different users are never mixed.

---

## MCP Server

The MCP server is the **sole interface through which AI applications interact with ChatDB**. It handles saving, reading, and searching conversations.

### Transport

| Mode | Endpoint | Notes |
|---|---|---|
| HTTP + SSE | `/mcp/sse` (GET) + `/mcp/messages` (POST) | Works through Cloudflare; recommended |
| Streamable HTTP | `/mcp` (POST) | MCP spec 2025-03-26 |

### Authentication

MCP clients authenticate via **OAuth 2.0 Dynamic Client Registration** (RFC 7591). The flow is fully automatic when using `mcp-remote`:

```
MCP Client
  │
  ├─ 1. GET /.well-known/oauth-authorization-server    ← discover endpoints (RFC 8414)
  ├─ 2. POST /oauth/register                           ← register client (RFC 7591 DCR)
  │      { client_name, redirect_uris }
  │      → 201 { client_id, client_secret }
  ├─ 3. Browser: GET /oauth/authorize                  ← user approves consent screen
  │      (client_id, redirect_uri, response_type=code, code_challenge)
  │      → redirect with authorization code
  ├─ 4. POST /oauth/token                              ← exchange code for access token
  │      (grant_type=authorization_code, code, code_verifier)
  │      → { access_token: "chatdb_tk_…", token_type: "bearer" }
  └─ 5. POST /mcp                                      ← MCP calls with Bearer token
         Authorization: Bearer chatdb_tk_…
```

On each MCP request:
1. Extract token from `Authorization` header
2. SHA-256 hash it
3. Look up `api_tokens` where `token_hash = ? AND revoked_at IS NULL`
4. Attach resolved `user_id` to request context — all reads/writes are scoped to it
5. Update `last_used_at`

Token format: `chatdb_tk_<32 random hex chars>`

Tokens can also be created manually in the Settings UI for clients that don't support OAuth (browser extensions, scripts).

### Exposed Tools

#### Write tools

| Tool | Description | Key parameters |
|---|---|---|
| `save_session` | Save a complete conversation at once | `app: string`, `messages: Message[]`, `title?: string` |
| `add_message` | Append a single message to an open session | `session_id: string`, `role: "user"\|"assistant"`, `content: string` |
| `create_session` | Open a new empty session, returns `session_id` | `app: string`, `title?: string` |

#### Read / search tools

| Tool | Description | Key parameters |
|---|---|---|
| `search_chats` | Hybrid full-text + semantic search | `query: string`, `limit?: number`, `app?: string` |
| `list_sessions` | List recent sessions with metadata | `limit?: number`, `app?: string`, `since?: ISO date` |
| `get_session` | Retrieve all messages in a session | `session_id: string` |
| `get_recent_context` | Return N most recent messages across all sessions | `limit?: number`, `app?: string` |

### Tool usage patterns

**Pattern A — save after conversation ends**
```
[conversation finishes]
→ call save_session({ app: "claude", messages: allMessages })
```

**Pattern B — stream save during conversation**
```
→ call create_session({ app: "chatgpt" })  → session_id
→ each turn: call add_message({ session_id, role, content })
```

**Pattern C — retrieve context at start of conversation**
```
→ call search_chats({ query: userQuery, limit: 5 })
→ inject returned snippets into system prompt as context
```

### Example: `save_session` request

```json
{
  "method": "tools/call",
  "params": {
    "name": "save_session",
    "arguments": {
      "app": "claude",
      "title": "Debugging Zustand re-renders",
      "messages": [
        { "role": "user",      "content": "My Zustand store isn't triggering re-renders...", "created_at": 1709100000 },
        { "role": "assistant", "content": "This usually happens when you mutate state directly...", "created_at": 1709100010 }
      ]
    }
  }
}
```

Response:
```json
{
  "content": [{ "type": "text", "text": "{\"session_id\": \"abc-123\", \"message_count\": 2}" }]
}
```

### Example: `search_chats` response

```json
{
  "content": [{
    "type": "text",
    "text": {
      "results": [
        {
          "session_id": "abc-123",
          "title": "Debugging Zustand re-renders",
          "app": "claude",
          "created_at": "2026-02-27T14:00:00Z",
          "matches": [
            { "role": "user",      "content": "My Zustand store isn't triggering re-renders...", "score": 0.95 },
            { "role": "assistant", "content": "This usually happens when you mutate state directly...", "score": 0.91 }
          ]
        }
      ]
    }
  }]
}
```

### Client config (Claude Desktop)

OAuth DCR is handled automatically by `mcp-remote` — no token needed in the config:

```json
{
  "mcpServers": {
    "chatdb": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://chatdb.example.com/mcp"]
    }
  }
}
```

On first connection, `mcp-remote` runs the DCR + OAuth flow and opens a browser window for the user to authorize. The token is cached locally for future sessions.

---

## Ingest API

The Ingest API is the write path for **browser extensions** that scrape conversation history from web-based AI apps (Gemini Web, ChatGPT Web, etc.) where no native MCP integration is available.

### Endpoint

```
POST /api/ingest
Authorization: Bearer chatdb_tk_<32 hex chars>
Content-Type: application/json
```

Same token format and auth flow as MCP. The token resolves to a `user_id`; all data is stored under that user.

### Request body

```json
{
  "app": "gemini",
  "title": "Planning a weekend trip to Kyoto",
  "messages": [
    {
      "role": "user",
      "content": "Can you help me plan a 3-day trip to Kyoto?",
      "created_at": 1709100000
    },
    {
      "role": "assistant",
      "content": "Absolutely! Here's a suggested itinerary...",
      "created_at": 1709100015
    }
  ],
  "metadata": {
    "source_url": "https://gemini.google.com/app/abc123",
    "scraped_at": 1709100060
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `app` | string | ✓ | Application ID: `"gemini"`, `"chatgpt"`, `"claude"`, etc. |
| `title` | string | — | Conversation title; derived from first message if omitted |
| `messages` | array | ✓ | Ordered list of `{ role, content, created_at }` |
| `messages[].role` | string | ✓ | `"user"` or `"assistant"` |
| `messages[].content` | string | ✓ | Message text |
| `messages[].created_at` | number | — | Unix timestamp (seconds); defaults to `now` if omitted |
| `metadata` | object | — | Arbitrary extra info (source URL, scrape timestamp, etc.) |

### Response

```json
{
  "session_id": "abc-123",
  "message_count": 12,
  "created": true
}
```

`created: false` is returned if the same conversation was already uploaded (deduplication by `source_url` in metadata, if provided).

### Processing steps

```
1. Authenticate Bearer token → resolve user_id
2. Look up (or create) application row for app ID
3. Insert session row → session_id
4. Insert messages in order
5. Update messages_fts (FTS triggers handle this automatically)
6. Embed each message → upsert vector store
7. Return { session_id, message_count, created }
```

### Browser extension usage

The extension scrapes the current page after the user finishes a conversation and POSTs it to the user's ChatDB instance. The API token is stored in extension storage (set once in the Settings page).

```javascript
// Minimal browser extension snippet
const response = await fetch('https://chatdb.example.com/api/ingest', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    app: 'gemini',
    title: document.title,
    messages: scrapeMessages(),   // DOM scraping logic
    metadata: { source_url: location.href, scraped_at: Date.now() / 1000 },
  }),
});
```

---

## Data Access Layer

Unified interface across environments. Drizzle ORM handles both SQLite drivers.

```
lib/
├── db.ts       — getDb(): Drizzle instance (D1 in prod, better-sqlite3 locally)
├── vector.ts   — getVectorClient(): Vectorize in prod, ChromaDB locally
├── schema.ts   — Drizzle table definitions (shared)
└── embed.ts    — getEmbedding(text, env?): float[] via Workers AI binding (prod) or CF REST API (local)
```

### `lib/db.ts`

```typescript
import { drizzle as drizzleD1 }     from 'drizzle-orm/d1';
import { drizzle as drizzleSQLite } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';

export function getDb(d1?: D1Database) {
  if (process.env.NODE_ENV === 'production' && d1) {
    return drizzleD1(d1, { schema });
  }
  const sqlite = new Database(process.env.SQLITE_PATH ?? 'local.db');
  return drizzleSQLite(sqlite, { schema });
}
```

### `lib/vector.ts`

```typescript
export async function getVectorClient() {
  if (process.env.NODE_ENV === 'production') {
    return new CloudflareVectorizeClient(); // via Worker binding
  }
  const { ChromaClient } = await import('chromadb');
  return new ChromaClient({ path: process.env.CHROMA_URL ?? 'http://localhost:8000' });
}
```

---

## Web API Routes

These routes serve the browser UI only. AI apps must use the MCP server instead.

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/chats` | List sessions (paginated, filterable) | Session cookie |
| GET | `/api/chats/[id]` | Get session + all messages | Session cookie |
| DELETE | `/api/chats/[id]` | Delete session + vectors | Session cookie |
| GET | `/api/search` | Hybrid search | Session cookie |
| GET | `/api/search/fts` | Keyword-only search | Session cookie |
| GET | `/api/search/vector` | Semantic-only search | Session cookie |
| GET | `/api/applications` | List AI applications | Session cookie |
| GET | `/api/tokens` | List API tokens (metadata only) | Session cookie |
| POST | `/api/tokens` | Create a new API token | Session cookie |
| DELETE | `/api/tokens/[id]` | Revoke a token | Session cookie |
| POST | `/api/ingest` | Ingest a full conversation (browser extension) | Bearer token |
| GET/POST | `/mcp` | MCP Streamable HTTP | Bearer token |
| GET | `/.well-known/oauth-authorization-server` | OAuth server metadata (RFC 8414) | Public |
| POST | `/oauth/register` | Dynamic Client Registration (RFC 7591) | Public |
| GET | `/oauth/authorize` | OAuth authorization consent screen | Session cookie |
| POST | `/oauth/token` | Exchange authorization code for access token | Client credentials |

---

## Search Architecture

### 1. Full-Text Search (keyword)

SQLite FTS5 — available in both `better-sqlite3` and Cloudflare D1.

```sql
SELECT m.*, s.title, s.app_id,
       snippet(messages_fts, 0, '<mark>', '</mark>', '…', 20) AS snippet
FROM   messages_fts fts
JOIN   messages m  ON m.rowid = fts.rowid
JOIN   sessions s  ON s.id = m.session_id
WHERE  messages_fts MATCH :query
  AND  s.user_id = :userId
ORDER  BY rank
LIMIT  20
```

### 2. Semantic / Vector Search

```
1. Embed query text → float[] (embed.ts)
2. Query vector store:
     namespace/collection = user_id
     top_k = 20, filter: { user_id }
3. Retrieve matched message IDs
4. JOIN with messages + sessions in relational DB
5. Return ranked results with cosine similarity score
```

### 3. Hybrid Search (default)

```
1. Run FTS  → fts_results  (BM25 rank score)
2. Run vector → vec_results  (cosine similarity)
3. Reciprocal Rank Fusion (RRF) to merge
4. Deduplicate by message_id
5. Return top 20
```

---

## Authentication

### Web users — GitHub OAuth (NextAuth.js)

```
Browser → "Sign in with GitHub"
  → GitHub OAuth → profile
  → NextAuth callback: upsert users row, create httpOnly JWT cookie
  → Redirect to /chats

Web API middleware:
  → validates session cookie → injects user_id into request context
```

### MCP clients — OAuth 2.0 Dynamic Client Registration

MCP clients authenticate via a full OAuth 2.0 flow:

```
MCP client (via mcp-remote)
  → GET /.well-known/oauth-authorization-server → discover endpoints
  → POST /oauth/register                        → register (DCR, RFC 7591)
  → Browser: /oauth/authorize                   → user approves consent
  → POST /oauth/token                           → exchange code → chatdb_tk_…
  → POST /mcp (Bearer chatdb_tk_…)              → MCP calls
```

### Browser extension & scripts — manual Bearer token

Clients that don't support OAuth create tokens in the Settings UI:

```
POST /api/ingest → Authorization: Bearer chatdb_tk_…
  → SHA-256 hash → lookup api_tokens
  → inject user_id into handler context
  → update last_used_at
```

All three auth paths are separate. Web sessions never grant MCP/API access; tokens never grant web UI access.

---

## Embedding Strategy

Both local development and production use the same model via Cloudflare Workers AI:

| Model | Dimensions | Cost | Notes |
|---|---|---|---|
| `@cf/baai/bge-base-en-v1.5` | 768 | Included in Workers AI free tier | Used in all environments |

Because the same model is used everywhere, the Vectorize index `dimensions` is always **768** and embeddings are fully portable between local and production.

### `lib/embed.ts`

In production the Workers AI **binding** is used directly (zero latency, no network hop). In local development, the same model is called through the Cloudflare AI **REST API** using `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_AI_API_TOKEN`.

```typescript
const MODEL = '@cf/baai/bge-base-en-v1.5';

export async function getEmbedding(text: string, env?: { AI?: Ai }): Promise<number[]> {
  // Production: use Workers AI binding (fast, no egress cost)
  if (env?.AI) {
    const result = await env.AI.run(MODEL, { text: [text] }) as { data: number[][] };
    return result.data[0];
  }

  // Local dev: Cloudflare AI REST API — same model, same 768-dim output
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID!;
  const apiToken  = process.env.CLOUDFLARE_AI_API_TOKEN!;
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: [text] }),
    }
  );
  const json = await res.json() as { result: { data: number[][] } };
  return json.result.data[0];
}
```

Embeddings are computed **at save time** (inside `save_session` / `add_message` MCP tools and the Ingest API handler). Search queries are embedded on-the-fly using the same function.

---

## Local Development Setup

```
┌──────────────────────────────────────────────┐
│  Local Machine                               │
│                                              │
│  next dev              localhost:3000        │
│  better-sqlite3        ./local.db            │
│  ChromaDB (Docker)     localhost:8000        │
└──────────────────────────────────────────────┘
```

### `.env.local`

```env
AUTH_SECRET=<random>
AUTH_GITHUB_ID=<github-oauth-client-id>
AUTH_GITHUB_SECRET=<github-oauth-client-secret>

SQLITE_PATH=./local.db

CHROMA_URL=http://localhost:8000

# Workers AI via REST API (local dev — same model as production)
CLOUDFLARE_ACCOUNT_ID=<your-account-id>
CLOUDFLARE_AI_API_TOKEN=<api-token-with-workers-ai-read-permission>
```

### Start ChromaDB

```bash
docker run -p 8000:8000 chromadb/chroma
```

---

## Production Setup (Cloudflare)

```
┌─────────────────────────────────────────────────────┐
│  Cloudflare Edge                                     │
│                                                      │
│  Pages (@cloudflare/next-on-pages)                   │
│    ├── Binding: DB        → D1 database              │
│    ├── Binding: VECTORIZE → Vectorize index          │
│    ├── Binding: AI        → Workers AI               │
│    └── Binding: KV        → NextAuth session store   │
└─────────────────────────────────────────────────────┘
```

### `wrangler.toml`

```toml
name = "chatdb"
compatibility_date = "2024-12-01"

[[d1_databases]]
binding = "DB"
database_name = "chatdb-prod"
database_id = "<your-d1-id>"

[[vectorize]]
binding = "VECTORIZE"
index_name = "chatdb-messages"
dimensions = 768        # @cf/baai/bge-base-en-v1.5
metric = "cosine"

[ai]
binding = "AI"          # Workers AI — @cf/baai/bge-base-en-v1.5

[[kv_namespaces]]
binding = "KV"
id = "<your-kv-id>"
```

### Environment variables (Cloudflare dashboard)

```
AUTH_SECRET=...
AUTH_GITHUB_ID=...
AUTH_GITHUB_SECRET=...
# No separate embedding API key needed — Workers AI binding handles it
```

---

## Security Considerations

- All web API routes require a valid NextAuth session cookie — no unauthenticated access
- All MCP endpoints require a valid non-revoked token — resolved to a `user_id`
- Every DB query and vector search is scoped to the authenticated `user_id`
- Token raw values are never stored — only SHA-256 hashes
- Tokens are shown to the user exactly once (at creation); cannot be retrieved again
- D1 and Vectorize are accessible only via Cloudflare Worker bindings — never directly from the internet

---

## Directory Structure

```
chatdb/
├── app/
│   ├── (auth)/
│   │   └── login/page.tsx
│   ├── .well-known/
│   │   └── oauth-authorization-server/route.ts  — OAuth discovery (RFC 8414)
│   ├── oauth/
│   │   ├── register/route.ts     — Dynamic Client Registration (RFC 7591)
│   │   ├── authorize/page.tsx    — OAuth consent screen
│   │   └── token/route.ts        — Authorization code → access token
│   ├── chats/
│   │   ├── page.tsx              — chat list
│   │   └── [id]/page.tsx         — chat detail
│   ├── search/page.tsx
│   ├── settings/page.tsx
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts
│   │   ├── chats/route.ts
│   │   ├── chats/[id]/route.ts
│   │   ├── search/route.ts
│   │   ├── applications/route.ts
│   │   ├── tokens/route.ts
│   │   └── ingest/route.ts       — browser extension upload endpoint
│   └── mcp/
│       └── route.ts              — MCP Streamable HTTP (GET/POST/DELETE)
├── lib/
│   ├── schema.ts                 — Drizzle schema (shared)
│   ├── db.ts                     — getDb() factory
│   ├── vector.ts                 — getVectorClient() factory
│   ├── embed.ts                  — getEmbedding() factory
│   ├── oauth.ts                  — OAuth helpers (sha256hex, s256, issueAuthCode)
│   ├── token-auth.ts             — Bearer token generation + verification
│   └── mcp/
│       ├── server.ts             — MCP server instance + tool registration
│       └── tools/
│           ├── save-session.ts
│           ├── add-message.ts
│           ├── create-session.ts
│           ├── search-chats.ts
│           ├── list-sessions.ts
│           ├── get-session.ts
│           └── get-context.ts
├── components/
├── docs/
│   ├── index.html
│   └── technical/
│       └── architecture.md
├── drizzle/
│   └── migrations/
├── wrangler.toml
└── .env.local
```
