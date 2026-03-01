'use client';

import { Suspense, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import type { Application, SearchResult } from '@/lib/types';
import { buildAppMap } from '@/lib/ui';

export default function SearchPage() {
  return <Suspense><SearchPageInner /></Suspense>;
}

function SearchPageInner() {
  const searchParams = useSearchParams();
  const initialQ = searchParams.get('q') ?? '';
  const [query, setQuery] = useState(initialQ);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [apps, setApps] = useState<Application[]>([]);
  // Track the last committed search query so chat links can encode it in `from`
  const committedQuery = useRef('');

  useEffect(() => {
    fetch('/api/applications')
      .then((r) => r.json() as Promise<{ applications: Application[] }>)
      .then((d) => setApps(d.applications ?? []))
      .catch(() => {});
    // Re-run the search if we came back with a ?q= param
    if (initialQ) search(initialQ);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Map from app ID → { displayName, iconUrl, color }
  const appMap = useMemo(() => buildAppMap(apps), [apps]);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setSearched(false); return; }
    setSearching(true);
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const d = await r.json() as { results: SearchResult[] };
      setResults(d.results ?? []);
      setSearched(true);
      committedQuery.current = q;
    } finally {
      setSearching(false);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    search(query);
  };

  // Group results by session
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.sessionId]) acc[r.sessionId] = [];
    acc[r.sessionId].push(r);
    return acc;
  }, {});

  // Build the `from` param so the chat detail page can show "← Search" and
  // restore context (the search URL with the original query).
  const fromParam = `?from=${encodeURIComponent('/search?q=' + encodeURIComponent(committedQuery.current))}`;

  return (
    <div className="flex h-screen bg-surface-elevated">
      <Sidebar activePage="search" />

      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        {/* Search bar */}
        <div className="bg-white border-b border-surface-separator px-4 py-4 md:px-6">
          <form onSubmit={handleSubmit} className="max-w-2xl">
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-label-tertiary">🔍</span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your conversations…"
                className="w-full pl-11 pr-4 py-2.5 bg-surface-elevated rounded-xl border border-surface-separator text-sm focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/20 transition-all"
              />
            </div>
          </form>
        </div>

        <div className="px-4 py-5 md:px-8 md:py-8">
          {searching && (
            <div className="text-center text-label-tertiary py-12">Searching…</div>
          )}

          {!searching && searched && results.length === 0 && (
            <div className="text-center py-20">
              <div className="text-5xl mb-4">🔍</div>
              <p className="font-medium text-label-secondary">No results for &ldquo;{query}&rdquo;</p>
            </div>
          )}

          {!searching && Object.entries(grouped).map(([sessionId, msgs]) => {
            const first = msgs[0];
            return (
              <div key={sessionId} className="mb-6">
                <Link
                  href={`/chats/${sessionId}${fromParam}`}
                  className="flex items-center gap-2 mb-2 text-sm font-semibold text-label-primary hover:text-accent-blue transition-colors"
                >
                  <span>{first.sessionTitle ?? 'Untitled conversation'}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${appMap[first.appId]?.color ?? 'bg-gray-100 text-gray-600'}`}>
                    {appMap[first.appId]?.displayName ?? first.appId}
                  </span>
                  <span className="text-accent-blue text-xs ml-auto">Open →</span>
                </Link>
                <div className="space-y-2 pl-2">
                  {msgs.map((r) => (
                    <Link
                      key={r.messageId}
                      href={`/chats/${r.sessionId}${fromParam}`}
                      className="block bg-white rounded-xl border border-surface-separator p-4 hover:border-accent-blue/30 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          r.role === 'user' ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-500'
                        }`}>
                          {r.role}
                        </span>
                      </div>
                      <p
                        className="text-sm text-label-secondary leading-relaxed line-clamp-3"
                        dangerouslySetInnerHTML={{ __html: r.snippet }}
                      />
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}

          {!searched && !searching && (
            <div className="text-center py-20 text-label-tertiary">
              <div className="text-5xl mb-4">🔍</div>
              <p>Search across all your AI conversations</p>
              <p className="text-sm mt-1">Uses hybrid keyword + semantic search</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
