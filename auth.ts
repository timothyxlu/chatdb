// NextAuth v5 configuration
// Handles GitHub OAuth for human users accessing the web UI.
// MCP clients and browser extensions authenticate via Bearer tokens (see lib/token-auth.ts).

import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import { db } from './lib/db';
import { users } from './lib/schema';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID!,
      clientSecret: process.env.AUTH_GITHUB_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      if (!profile?.id) return false;

      const githubId = String(profile.id);
      const database = db(); // local SQLite in dev; production routes provide D1

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
