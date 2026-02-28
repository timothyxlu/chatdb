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

  webpack(config, { dev, isServer, nextRuntime }) {
    // Stub local-dev-only packages when they can't be resolved at runtime:
    //  - Production: all bundles (Cloudflare provides D1/Vectorize/Workers AI)
    //  - Dev edge/middleware: Node-only packages can't run in edge runtime
    //  - Dev client: Node-only packages can't run in the browser
    // Dev server (Node.js) relies on serverExternalPackages instead.
    if (!dev || !isServer || nextRuntime === 'edge') {
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
