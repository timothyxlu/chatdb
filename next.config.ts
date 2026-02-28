import type { NextConfig } from 'next';
import path from 'path';

// Packages only used in local dev (never in production Cloudflare Workers)
const LOCAL_DEV_PACKAGES = [
  '@libsql/client',
  'libsql',
  'chromadb',
  'ollama',
];

const nextConfig: NextConfig = {
  // ESM-only packages that Next.js needs to transpile
  transpilePackages: ['react-markdown', 'remark-gfm', 'rehype-highlight', 'highlight.js'],
  // Prevent local-dev-only packages from being bundled in Node.js server routes.
  // Production uses Cloudflare D1 (database) and Vectorize (vector store) directly.
  serverExternalPackages: LOCAL_DEV_PACKAGES,

  webpack(config, { nextRuntime }) {
    if (nextRuntime === 'edge') {
      // In edge (Cloudflare Workers) builds, native/Node.js-only packages cannot
      // be bundled. Replace them with empty stubs — they are only used in local
      // dev code paths (getLocalDb, ChromaVectorClient) that are never reached
      // in production where D1 and Vectorize bindings are always provided.
      const stub = path.resolve('./lib/node-only-stub.js');
      config.resolve.alias = {
        ...(config.resolve.alias as Record<string, string>),
        ...Object.fromEntries(LOCAL_DEV_PACKAGES.map((pkg) => [pkg, stub])),
      };
    }
    return config;
  },
};

export default nextConfig;
