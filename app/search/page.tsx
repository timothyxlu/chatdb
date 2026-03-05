'use client';

import { Suspense, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import type { Application, SearchResult } from '@/lib/types';
import { buildAppMap, formatDate, formatDuration } from '@/lib/ui';

const TIME_FILTERS = [
  { label: 'Any time', value: 'any' },
  { label: 'Past week', value: 'week' },
  { label: 'Past month', value: 'month' },
] as const;

const IN_FILTERS = [
  { label: 'All messages', value: 'all' },
  { label: 'Titles only', value: 'titles' },
] as const;

type TimeFilter = (typeof TIME_FILTERS)[number]['value'];
type InFilter = (typeof IN_FILTERS)[number]['value'];

function AppIcon({ displayName, iconUrl, swatch }: { displayName: string; iconUrl?: string | null; swatch: string }) {
  if (iconUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={iconUrl} alt="" className="w-7 h-7 rounded-full object-contain shrink-0" />;
  }
  return (
    <div
      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
      style={{ backgroundColor: swatch + '33', color: swatch }}
    >
      {displayName.charAt(0).toUpperCase()}
    </div>
  );
}

/** Wrap every occurrence of each token in the text with <mark> tags. */
function highlightTokens(text: string, tokens: string[]): string {
  if (!tokens.length) return text;
  // Escape special regex chars in each token, then join as alternation
  const pattern = tokens
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  return text.replace(new RegExp(`(${pattern})`, 'gi'), '<mark>$1</mark>');
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors whitespace-nowrap ${
        active
          ? 'bg-blue-500 text-white'
          : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300 hover:bg-gray-50'
      }`}
    >
      {children}
    </button>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchPageInner />
    </Suspense>
  );
}

function SearchPageInner() {
  const searchParams = useSearchParams();
  const initialQ = searchParams.get('q') ?? '';
  const [query, setQuery] = useState(initialQ);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [apps, setApps] = useState<Application[]>([]);
  const [filterApp, setFilterApp] = useState<string>('all');
  const [filterTime, setFilterTime] = useState<TimeFilter>('any');
  const [filterIn, setFilterIn] = useState<InFilter>('all');
  const [sort, setSort] = useState<'relevant' | 'latest'>('relevant');
  const committedQuery = useRef('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/applications')
      .then((r) => r.json() as Promise<{ applications: Application[] }>)
      .then((d) => setApps(d.applications ?? []))
      .catch(() => {});
    if (initialQ) search(initialQ, 'all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ⌘K to focus the search input
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const appMap = useMemo(() => buildAppMap(apps), [apps]);

  const search = useCallback(async (q: string, appId: string) => {
    if (!q.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setSearching(true);
    try {
      const params = new URLSearchParams({ q });
      if (appId !== 'all') params.set('app', appId);
      const r = await fetch(`/api/search?${params}`);
      const d = (await r.json()) as { results: SearchResult[] };
      setResults(d.results ?? []);
      setSearched(true);
      committedQuery.current = q;
    } finally {
      setSearching(false);
    }
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    search(query, filterApp);
  };

  const handleAppFilter = (appId: string) => {
    setFilterApp(appId);
    if (query) search(query, appId);
  };

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setSearched(false);
    inputRef.current?.focus();
  };

  // Group results by session, apply "Titles only" filter, then sort
  const grouped = useMemo(() => {
    // Tokenise the committed query for title matching
    const queryTokens = committedQuery.current
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 1);

    let groups = Object.entries(
      results.reduce<Record<string, SearchResult[]>>((acc, r) => {
        if (!acc[r.sessionId]) acc[r.sessionId] = [];
        acc[r.sessionId].push(r);
        return acc;
      }, {}),
    );

    // "Titles only" — keep sessions whose title contains at least one query token
    if (filterIn === 'titles') {
      groups = groups.filter(([, msgs]) => {
        const title = (msgs[0].sessionTitle ?? '').toLowerCase();
        return queryTokens.some((token) => title.includes(token));
      });
    }

    if (sort === 'latest') {
      groups.sort(([, a], [, b]) => {
        const aMax = Math.max(...a.map((r) => r.createdAt));
        const bMax = Math.max(...b.map((r) => r.createdAt));
        return bMax - aMax;
      });
    } else {
      groups.sort(([, a], [, b]) => {
        const aScore = Math.max(...a.map((r) => r.score));
        const bScore = Math.max(...b.map((r) => r.score));
        return bScore - aScore;
      });
    }

    return groups;
  }, [results, sort, filterIn]);

  // Tokens used for client-side title highlighting
  const titleTokens = useMemo(
    () =>
      committedQuery.current
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 1),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searched], // recompute whenever a new search completes
  );

  const fromParam = `?from=${encodeURIComponent('/search?q=' + encodeURIComponent(committedQuery.current))}`;

  return (
    <div className="flex h-dvh bg-[#F5F5F7]">
      <Sidebar activePage="search" />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden md:pt-0" style={{ paddingTop: 'calc(3.5rem + env(safe-area-inset-top))' }}>
        {/* ── Search hero ── */}
        <div className="bg-white/80 backdrop-blur border-b border-black/[0.07] px-8 py-6 shrink-0">
          <form onSubmit={handleSubmit}>
            <div className="flex items-center gap-3 bg-white border-[1.5px] border-blue-300 rounded-2xl px-4 py-3 shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
              {/* Search icon */}
              <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>

              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your conversations…"
                className="flex-1 text-sm text-gray-800 placeholder-gray-400 outline-none bg-transparent"
              />

              {/* Clear button */}
              {query && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="text-gray-400 hover:text-gray-600 transition-colors shrink-0"
                  aria-label="Clear search"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}

              {/* ⌘K hint */}
              <kbd className="hidden md:inline-flex items-center gap-0.5 text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-md px-1.5 py-0.5 font-mono shrink-0">
                ⌘K
              </kbd>
            </div>
          </form>

          {/* ── Filter bar ── */}
          <div className="flex items-center gap-1.5 mt-4 flex-wrap">
            <span className="text-xs text-gray-400 font-medium mr-0.5">App</span>
            <FilterPill active={filterApp === 'all'} onClick={() => handleAppFilter('all')}>
              All
            </FilterPill>
            {apps.map((app) => (
              <FilterPill key={app.id} active={filterApp === app.id} onClick={() => handleAppFilter(app.id)}>
                {app.displayName}
              </FilterPill>
            ))}

            <div className="w-px h-4 bg-gray-200 mx-1 shrink-0" />

            <span className="text-xs text-gray-400 font-medium mr-0.5">Time</span>
            {TIME_FILTERS.map((f) => (
              <FilterPill key={f.value} active={filterTime === f.value} onClick={() => setFilterTime(f.value)}>
                {f.label}
              </FilterPill>
            ))}

            <div className="w-px h-4 bg-gray-200 mx-1 shrink-0" />

            <span className="text-xs text-gray-400 font-medium mr-0.5">In</span>
            {IN_FILTERS.map((f) => (
              <FilterPill key={f.value} active={filterIn === f.value} onClick={() => setFilterIn(f.value)}>
                {f.label}
              </FilterPill>
            ))}
          </div>
        </div>

        {/* ── Results ── */}
        <div className="flex-1 overflow-y-auto px-8 py-6" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>
          {searching && <div className="text-center text-gray-400 py-16 text-sm">Searching…</div>}

          {!searching && searched && (
            <>
              {/* Results header */}
              <div className="flex items-center justify-between mb-5">
                <p className="text-sm text-gray-500">
                  <span className="font-semibold text-gray-800">{grouped.length} result{grouped.length !== 1 ? 's' : ''}</span>
                  {' '}for &ldquo;{committedQuery.current}&rdquo;
                  {filterIn === 'titles' && <span className="ml-1 text-gray-400">(titles only)</span>}
                </p>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as 'relevant' | 'latest')}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 bg-white outline-none focus:border-blue-300 cursor-pointer"
                >
                  <option value="relevant">Most Relevant</option>
                  <option value="latest">Latest</option>
                </select>
              </div>

              {grouped.length === 0 ? (
                <div className="text-center py-20">
                  <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <p className="font-medium text-gray-500">No results for &ldquo;{committedQuery.current}&rdquo;</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {grouped.map(([sessionId, msgs]) => {
                    const first = msgs[0];
                    const appInfo = appMap[first.appId];
                    const displayName = appInfo?.displayName ?? first.appId;

                    return (
                      <Link
                        key={sessionId}
                        href={`/chats/${sessionId}${fromParam}`}
                        className="block bg-white rounded-2xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all overflow-hidden group"
                      >
                        {/* Card header */}
                        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
                          <AppIcon displayName={displayName} iconUrl={appInfo?.iconUrl} swatch={appInfo?.swatch ?? '#6b7280'} />
                          <div className="flex-1 min-w-0">
                            <span
                              className="block font-semibold text-gray-900 text-sm leading-snug [&_mark]:bg-yellow-200 [&_mark]:text-yellow-900 [&_mark]:rounded-sm [&_mark]:not-italic"
                              dangerouslySetInnerHTML={{
                                __html: highlightTokens(first.sessionTitle ?? 'Untitled conversation', titleTokens),
                              }}
                            />
                            {appInfo && (
                              <span className={`inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded-full ${appInfo.color}`}>
                                {displayName}
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-semibold text-blue-500 shrink-0">
                            {msgs.length} match{msgs.length !== 1 ? 'es' : ''}
                          </span>
                        </div>

                        {/* Matching messages */}
                        <div className="flex flex-col gap-2 p-3">
                          {msgs.map((r) => (
                            <div
                              key={r.messageId}
                              className={`px-4 py-3 rounded-xl border ${
                                r.role === 'user'
                                  ? 'bg-blue-50/60 border-blue-100'
                                  : 'bg-gray-50 border-gray-100'
                              }`}
                            >
                              <div
                                className={`text-[11px] font-bold tracking-wider mb-1.5 ${
                                  r.role === 'user' ? 'text-blue-500' : 'text-orange-500'
                                }`}
                              >
                                {r.role === 'user' ? 'YOU' : displayName.toUpperCase()}
                              </div>
                              <p
                                className="text-sm text-gray-600 leading-relaxed line-clamp-2 [&_mark]:bg-yellow-200 [&_mark]:text-yellow-900 [&_mark]:rounded-sm [&_mark]:not-italic"
                                dangerouslySetInnerHTML={{ __html: r.snippet }}
                              />
                            </div>
                          ))}
                        </div>

                        {/* Card footer */}
                        <div className="flex items-center gap-3 px-5 py-2.5 border-t border-gray-50 text-xs text-gray-400">
                          <span>{formatDate(first.sessionCreatedAt)}</span>
                          <span className="flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                            {first.sessionMessageCount} messages
                          </span>
                          <span className="flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {formatDuration(first.sessionCreatedAt, first.sessionUpdatedAt)}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {!searched && !searching && (
            <div className="text-center py-24 text-gray-400">
              <svg className="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p className="font-medium">Search across all your AI conversations</p>
              <p className="text-sm mt-1">Uses hybrid keyword + semantic search</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
