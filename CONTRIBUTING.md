# Contributing to Chats

Thank you for your interest in contributing!

## Getting Started

1. Fork the repository and clone your fork
2. Follow the [Local Development](README.md#local-development-without-docker) setup in the README
3. Create a feature branch: `git checkout -b feat/your-feature`

## Development Workflow

```bash
npm install
cp .env.local.example .env.local   # fill in GitHub OAuth + AUTH_SECRET
npm run db:push                     # initialise local SQLite
npm run dev                         # http://localhost:3000
```

Run the linter before committing:

```bash
npm run lint
```

## Project Structure

```
app/          Next.js App Router pages and API routes
lib/          Shared logic (db, search, embed, vector, MCP tools)
db/           SQL migration files
types/        Cloudflare Workers global type declarations
```

Key files:

| File | Purpose |
|---|---|
| `lib/schema.ts` | Drizzle ORM table definitions — single source of truth for the DB schema |
| `lib/search.ts` | Hybrid FTS + vector search with Reciprocal Rank Fusion |
| `lib/embed.ts` | Embedding abstraction (Workers AI / Ollama / Cloudflare REST) |
| `lib/vector.ts` | Vector store abstraction (Vectorize / ChromaDB) |
| `lib/mcp/server.ts` | MCP server definition |
| `lib/mcp/tools/` | One file per MCP tool |
| `app/api/ingest/route.ts` | REST ingest endpoint (browser extensions) |
| `app/mcp/route.ts` | MCP HTTP endpoint |

## Making Schema Changes

1. Edit `lib/schema.ts`
2. Run `npm run db:generate` to create a migration file in `db/migrations/`
3. Run `npm run db:push` to apply it locally (or `npm run db:migrate:local`)
4. Commit both the schema change and the migration file

## Adding an MCP Tool

1. Create `lib/mcp/tools/your-tool.ts` — export a `registerYourTool(server, db, vector)` function
2. Register it in `lib/mcp/server.ts`
3. Add a corresponding entry to the MCP tools table in `README.md`

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Include a short description of *why* the change is needed
- If you change the DB schema, include the migration file
- If you add a new dependency, explain why it can't be done with what's already there

## Reporting Issues

Please open a GitHub issue with:
- Steps to reproduce
- Expected vs actual behaviour
- Environment (OS, Node version, Docker version if applicable)

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
