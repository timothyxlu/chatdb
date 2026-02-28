/// <reference types="@cloudflare/workers-types" />

// Cloudflare Workers environment bindings
// These match the bindings declared in wrangler.toml

export interface CloudflareEnv {
  // Cloudflare D1 — relational database
  DB: D1Database;
  // Cloudflare Vectorize — vector store (768-dim, @cf/baai/bge-base-en-v1.5)
  VECTORIZE: VectorizeIndex;
  // Cloudflare Workers AI — embedding model
  AI: Ai;
  // Cloudflare KV — NextAuth session store
  KV: KVNamespace;
}

// Augment the global cloudflare types with our specific env shape
declare global {
  // Available in Cloudflare Workers runtime via getCloudflareContext()
  type CfEnv = CloudflareEnv;
}
