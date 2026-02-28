// ─────────────────────────────────────────────────────────────────────────────
// Embedding model abstraction — three paths by priority:
//
//  1. Production  : Cloudflare Workers AI binding (zero-latency, no egress)
//  2. Local/Docker: Ollama running locally      (fully offline, no API key)
//  3. Local/Dev   : Cloudflare AI REST API      (requires API token)
//
// All three paths use 768-dimensional vectors so ChromaDB ↔ Vectorize data
// remains structurally compatible.
// ─────────────────────────────────────────────────────────────────────────────

/** Cloudflare Workers AI model — used in production and Cloudflare REST fallback */
const CF_MODEL = '@cf/baai/bge-m3'; // 1024 dims, multilingual

/** Ollama model — `bge-m3` is 1024-dim and matches the production model exactly */
const OLLAMA_DEFAULT_MODEL = 'bge-m3';

/**
 * Generate an embedding vector for the given text.
 *
 * Path selection:
 *  - `ai` binding present  → Cloudflare Workers AI (production)
 *  - `OLLAMA_URL` env set  → Ollama REST API      (local / docker compose)
 *  - CF credentials set    → Cloudflare AI REST   (local without Ollama)
 */
export async function getEmbedding(text: string, ai?: Ai): Promise<number[]> {
  // ── 1. Production: Cloudflare Workers AI binding ────────────────────────
  if (ai) {
    const result = (await ai.run(CF_MODEL as Parameters<Ai['run']>[0], {
      text: [text],
    } as never)) as { data: number[][] };
    return result.data[0];
  }

  // ── 2. Local: Ollama (offline, preferred for docker compose) ────────────
  const ollamaUrl = process.env.OLLAMA_URL;
  if (ollamaUrl) {
    const model = process.env.OLLAMA_EMBED_MODEL ?? OLLAMA_DEFAULT_MODEL;
    const res = await fetch(`${ollamaUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: text }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Ollama embed error ${res.status}: ${body}`);
    }
    const json = (await res.json()) as { embeddings: number[][] };
    return json.embeddings[0];
  }

  // ── 3. Local: Cloudflare AI REST API (fallback when Ollama not available) ──
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_AI_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new Error(
      'No embedding service configured. Choose one:\n' +
        '  A) Ollama (offline): set OLLAMA_URL=http://localhost:11434 and run:\n' +
        '       ollama pull nomic-embed-text\n' +
        '  B) Cloudflare AI: set CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_AI_API_TOKEN in .env.local'
    );
  }

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CF_MODEL}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: [text] }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Cloudflare AI API error ${res.status}: ${body}`);
  }

  const json = (await res.json()) as { result: { data: number[][] } };
  return json.result.data[0];
}
