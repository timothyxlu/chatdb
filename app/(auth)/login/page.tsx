import { signIn } from '@/auth';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';

export default async function LoginPage() {
  const session = await auth();
  if (session) redirect('/chats');

  return (
    <div className="min-h-screen bg-surface-elevated flex items-center justify-center p-6">
      {/* Background gradient blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-gradient-to-br from-blue-100 to-purple-100 opacity-40 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] rounded-full bg-gradient-to-tr from-blue-50 to-indigo-100 opacity-30 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl shadow-black/10 border border-black/[0.07] p-10">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-2xl shadow-lg shadow-blue-600/25">
              💬
            </div>
            <div>
              <h1 className="text-xl font-bold text-label-primary tracking-tight">ChatDB</h1>
              <p className="text-xs text-label-tertiary">Your AI conversation history</p>
            </div>
          </div>

          {/* Features list */}
          <ul className="space-y-2 mb-8">
            {[
              ['🔍', 'Full-text & semantic search'],
              ['🔒', 'Private by default — your data only'],
              ['⚡', 'MCP-native for AI apps'],
            ].map(([icon, text]) => (
              <li key={text} className="flex items-center gap-2.5 text-sm text-label-secondary">
                <span className="text-base">{icon}</span>
                {text}
              </li>
            ))}
          </ul>

          {/* Sign in button */}
          <form
            action={async () => {
              'use server';
              await signIn('github');
            }}
          >
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2.5 bg-label-primary text-white font-semibold text-sm py-3 px-5 rounded-xl hover:bg-label-primary/90 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              Sign in with GitHub
            </button>
          </form>

          <p className="text-xs text-label-tertiary text-center mt-4">
            Only your GitHub profile is accessed. No repo permissions required.
          </p>
        </div>
      </div>
    </div>
  );
}
