'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import Markdown from '@/components/Markdown';
import type { Application, Message, Session } from '@/lib/types';
import { buildAppMap } from '@/lib/ui';

export default function ChatDetailPage() {
  return <Suspense><ChatDetailPageInner /></Suspense>;
}

function ChatDetailPageInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  // `from` is a URL like `/search?q=foo` encoded by the search results page
  const backHref = searchParams.get('from') ?? '/chats';

  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch session and applications in parallel
    Promise.all([
      fetch(`/api/chats/${id}`).then((r) => {
        if (!r.ok) throw new Error('Not found');
        return r.json() as Promise<{ session: Session; messages: Message[] }>;
      }),
      fetch('/api/applications').then((r) => r.json() as Promise<{ applications: Application[] }>),
    ])
      .then(([chatData, appData]) => {
        setSession(chatData.session);
        setMessages(chatData.messages);
        setApps(appData.applications ?? []);
      })
      .catch(() => router.push('/chats'))
      .finally(() => setLoading(false));
  }, [id, router]);

  // Map from app ID → { displayName, iconUrl, color }
  const appMap = useMemo(() => buildAppMap(apps), [apps]);

  async function toggleStar() {
    if (!session) return;
    const next = !session.starred;
    const res = await fetch(`/api/chats/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ starred: next }),
    });
    if (res.ok) setSession((prev) => prev ? { ...prev, starred: next ? 1 : 0 } : prev);
  }

  async function toggleArchive() {
    if (!session) return;
    const next = !session.archived;
    const res = await fetch(`/api/chats/${session.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: next }),
    });
    if (res.ok) setSession((prev) => prev ? { ...prev, archived: next ? 1 : 0 } : prev);
  }

  const app = session ? appMap[session.appId] : null;
  const date = session
    ? new Date(session.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  return (
    <div className="flex h-screen bg-surface-elevated">
      <Sidebar activePage="chats" />

      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-label-tertiary">Loading…</div>
          </div>
        ) : !session ? null : (
          <>
            {/* Top bar */}
            <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-surface-separator px-4 py-3 md:px-6 md:py-4 flex items-center gap-3 md:gap-4">
              <Link
                href={backHref}
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-label-secondary hover:bg-surface-elevated hover:text-label-primary transition-colors"
                title={backHref.startsWith('/search') ? 'Back to Search' : 'Back to Chats'}
              >
                ←
              </Link>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="font-semibold text-label-primary truncate">{session.title ?? 'Untitled'}</h1>
                  <button
                    onClick={toggleStar}
                    className={`text-lg shrink-0 transition-colors ${
                      session.starred ? 'text-yellow-500 hover:text-yellow-600' : 'text-label-tertiary hover:text-yellow-500'
                    }`}
                    title={session.starred ? 'Unstar' : 'Star'}
                  >
                    {session.starred ? '★' : '☆'}
                  </button>
                  <button
                    onClick={toggleArchive}
                    className={`text-sm shrink-0 transition-colors ${
                      session.archived ? 'text-label-secondary hover:text-label-primary' : 'text-label-tertiary hover:text-label-secondary'
                    }`}
                    title={session.archived ? 'Unarchive' : 'Archive'}
                  >
                    {session.archived ? '📤' : '📥'}
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${app?.color ?? 'bg-gray-100 text-gray-600'}`}>
                    {app?.displayName ?? session.appId}
                  </span>
                  <span className="text-xs text-label-tertiary">{session.messageCount} messages · {date}</span>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="max-w-4xl mx-auto px-4 md:px-8 py-8 space-y-6">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`text-sm ${
                      msg.role === 'user'
                        ? 'max-w-[80%] rounded-2xl rounded-br-md px-4 py-3 bg-accent-blue text-white'
                        : 'w-full text-label-primary'
                    }`}
                  >
                    <Markdown content={msg.content} className={msg.role === 'user' ? 'markdown-user' : ''} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
