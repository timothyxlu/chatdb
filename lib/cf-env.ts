// Helper to get Cloudflare environment bindings in Next.js route handlers.
// Returns bindings in production (Cloudflare Workers), empty object locally.

import type { CloudflareEnv } from '@/types/cloudflare';

export async function getCfEnv(): Promise<Partial<CloudflareEnv>> {
  if (process.env.NODE_ENV !== 'production') return {};
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    return (await getCloudflareContext()).env as Partial<CloudflareEnv>;
  } catch {
    return {};
  }
}
