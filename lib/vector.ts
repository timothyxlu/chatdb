// ─────────────────────────────────────────────────────────────────────────────
// Vector store abstraction
// Production: Cloudflare Vectorize (via Workers binding)
// Local dev:  ChromaDB (via Docker container)
// ─────────────────────────────────────────────────────────────────────────────

export interface VectorMetadata {
  messageId: string;
  sessionId: string;
  userId: string;
  appId: string;
  role: string;
  createdAt: number;
}

export interface VectorRecord {
  id: string;         // message UUID
  values: number[];   // 768-dim embedding
  metadata: VectorMetadata;
}

export interface VectorMatch {
  id: string;
  score: number;
  metadata: VectorMetadata;
}

export interface VectorClient {
  upsert(records: VectorRecord[]): Promise<void>;
  query(
    embedding: number[],
    userId: string,
    opts?: { topK?: number; appId?: string }
  ): Promise<VectorMatch[]>;
  delete(ids: string[]): Promise<void>;
}

// ── Cloudflare Vectorize implementation ──────────────────────────────────────
class VectorizeClient implements VectorClient {
  constructor(private readonly vectorize: VectorizeIndex) {}

  async upsert(records: VectorRecord[]) {
    await this.vectorize.upsert(
      records.map((r) => ({
        id: r.id,
        values: r.values,
        metadata: r.metadata as unknown as Record<string, string | number | boolean>,
      }))
    );
  }

  async query(embedding: number[], userId: string, opts: { topK?: number; appId?: string } = {}) {
    const results = await this.vectorize.query(embedding, {
      topK: opts.topK ?? 20,
      filter: opts.appId ? { userId, appId: opts.appId } : { userId },
      returnMetadata: 'all',
    });
    return results.matches.map((m: VectorizeMatch) => ({
      id: m.id,
      score: m.score,
      metadata: m.metadata as unknown as VectorMetadata,
    }));
  }

  async delete(ids: string[]) {
    await this.vectorize.deleteByIds(ids);
  }
}

// ── ChromaDB implementation (local dev) ──────────────────────────────────────
class ChromaVectorClient implements VectorClient {
  // Lazily initialised collection
  private _collection: Promise<import('chromadb').Collection> | null = null;

  private collection() {
    if (!this._collection) {
      this._collection = (async () => {
        const { ChromaClient } = await import('chromadb');
        const client = new ChromaClient({
          path: process.env.CHROMA_URL ?? 'http://localhost:8000',
        });
        return client.getOrCreateCollection({
          name: 'chatdb_messages',
          metadata: { 'hnsw:space': 'cosine' },
        });
      })();
    }
    return this._collection;
  }

  async upsert(records: VectorRecord[]) {
    const col = await this.collection();
    await col.upsert({
      ids: records.map((r) => r.id),
      embeddings: records.map((r) => r.values),
      metadatas: records.map((r) => r.metadata as unknown as import('chromadb').Metadata),
    });
  }

  async query(embedding: number[], userId: string, opts: { topK?: number; appId?: string } = {}) {
    const col = await this.collection();
    const where: Record<string, string> = { userId };
    if (opts.appId) where.appId = opts.appId;

    const results = await col.query({
      queryEmbeddings: [embedding],
      nResults: opts.topK ?? 20,
      where,
    });

    return (results.ids[0] ?? []).map((id, i) => ({
      id,
      score: 1 - (results.distances?.[0]?.[i] ?? 0), // cosine: distance → similarity
      metadata: results.metadatas[0][i] as unknown as VectorMetadata,
    }));
  }

  async delete(ids: string[]) {
    const col = await this.collection();
    await col.delete({ ids });
  }
}

// ── Factory ──────────────────────────────────────────────────────────────────
export function getVectorClient(vectorize?: VectorizeIndex | null): VectorClient {
  if (vectorize) return new VectorizeClient(vectorize);
  return new ChromaVectorClient();
}
