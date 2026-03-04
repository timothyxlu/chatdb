// NextAuth v5 configuration
// Handles GitHub OAuth for human users accessing the web UI.
// MCP clients and browser extensions authenticate via Bearer tokens (see lib/token-auth.ts).

import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import { db } from './lib/db';
import { getCfEnv } from './lib/cf-env';
import { users } from './lib/schema';

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Required on Cloudflare Workers — NextAuth can't auto-detect the host
  trustHost: true,
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID!,
      clientSecret: process.env.AUTH_GITHUB_SECRET!,
      // Disable PKCE — Cloudflare Workers can't reliably round-trip the
      // pkceCodeVerifier cookie (especially on iOS Safari desktop-mode switch).
      // State check is sufficient for server-side OAuth with a client secret.
      checks: ['state'],
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      if (!profile?.id) return false;

      const githubId = String(profile.id);
      const env = await getCfEnv();
      const database = db(env.DB);

      try {
        await database
          .insert(users)
          .values({
            id: githubId,
            githubId,
            username: (profile.login as string) ?? '',
            avatarUrl: profile.avatar_url as string | undefined,
            createdAt: Date.now(),
          })
          .onConflictDoUpdate({
            target: users.githubId,
            set: {
              username: (profile.login as string) ?? '',
              avatarUrl: profile.avatar_url as string | undefined,
            },
          });
      } catch (err) {
        console.error('Failed to upsert user:', err);
        return false;
      }

      return true;
    },

    // Persist GitHub user ID as the session user ID
    async session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },

    async jwt({ token, profile }) {
      if (profile?.id) token.sub = String(profile.id);
      return token;
    },
  },

  pages: {
    signIn: '/login',
  },
});
