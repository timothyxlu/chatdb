import type { NextConfig } from 'next';
import path from 'path';

// Packages only used in local dev (never in production Cloudflare Workers)
const LOCAL_DEV_PACKAGES = [
  '@libsql/client',
  'libsql',
  'chromadb',
  'ollama',
];

const isDev = process.env.NODE_ENV !== 'production';

const nextConfig: NextConfig = {
  // ESM-only packages that Next.js needs to transpile
  transpilePackages: ['react-markdown', 'remark-gfm', 'rehype-highlight', 'highlight.js'],
  // In local dev, keep these as external so Node.js resolves them at runtime.
  // In production builds, webpack stubs them out (see below) so they never
  // reach OpenNext's esbuild step.
  serverExternalPackages: isDev ? LOCAL_DEV_PACKAGES : [],

  webpack(config, { dev }) {
    if (!dev) {
      // Production build: replace local-dev-only packages with empty stubs.
      // These packages (libsql, chromadb, ollama) are only used in local dev
      // code paths that are never reached in production where Cloudflare D1,
      // Vectorize, and Workers AI bindings are always provided.
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
