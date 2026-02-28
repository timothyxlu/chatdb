'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import type { Application, SessionWithPreview, Stats } from '@/lib/types';
import { buildAppMap, dateStrToMs, formatDate, formatDuration } from '@/lib/ui';

export default function ChatsPage() {
  const searchParams = useSearchParams();
  const [sessions, setSessions] = useState<SessionWithPreview[]>([]);
  const [apps, setApps] = useState<Application[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filter, setFilter] = useState<string>(() => searchParams.get('filter') ?? 'all');
  const [startDate, setStartDate] = useState<string>(() => searchParams.get('startDate') ?? '');
  const [endDate, setEndDate] = useState<string>(() => searchParams.get('endDate') ?? '');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Build the `from` param so pressing ← in the detail page restores this page's state
  const fromParam = useMemo(() => {
    const p = new URLSearchParams();
    if (filter !== 'all') p.set('filter', filter);
    if (startDate) p.set('startDate', startDate);
    if (endDate) p.set('endDate', endDate);
    const qs = p.toString();
    return `?from=${encodeURIComponent('/chats' + (qs ? `?${qs}` : ''))}`;
  }, [filter, startDate, endDate]);

  // Fetch applications and user profile once on mount
  useEffect(() => {
    fetch('/api/applications')
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => setApps((d as { applications: Application[] }).applications ?? []))
      .catch(() => {});
    fetch('/api/stats')
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => setStats(d as Stats))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filter === 'starred') params.set('starred', '1');
    else if (filter !== 'all') params.set('app', filter);
    const since = dateStrToMs(startDate);
    if (since !== null) params.set('since', String(since));
    const until = dateStrToMs(endDate, true);
    if (until !== null) params.set('until', String(until));
    const qs = params.toString();
    const url = `/api/chats${qs ? `?${qs}` : ''}`;
    setLoading(true);
    fetch(url)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => setSessions((d as { sessions: SessionWithPreview[] }).sessions ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filter, startDate, endDate]);

  // Map from app ID → { displayName, iconUrl, color }
  const appMap = useMemo(() => buildAppMap(apps), [apps]);

  const activeLabel =
    filter === 'all' ? 'All Chats' : filter === 'starred' ? 'Starred' : (appMap[filter]?.displayName ?? filter);

  async function toggleStar(e: React.MouseEvent, sessionId: string, current: number) {
    e.preventDefault();
    e.stopPropagation();
    const next = current ? false : true;
    const res = await fetch(`/api/chats/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ starred: next }),
    });
    if (!res.ok) return;
    setSessions((prev) =>
      prev
        .map((s) => (s.id === sessionId ? { ...s, starred: next ? 1 : 0 } : s))
        .filter((s) => (filter === 'starred' ? s.starred === 1 : true))
    );
  }

  return (
    <div className="flex h-screen bg-surface-elevated">
      <Sidebar activePage="chats" filter={filter} onFilterChange={setFilter} />

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="px-8 py-8">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-label-primary tracking-tight">{activeLabel}</h1>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (searchQuery.trim()) router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
              }}
              className="relative"
            >
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-label-tertiary text-sm">🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search conversations…"
                className="pl-9 pr-4 py-2 w-64 bg-white border border-surface-separator rounded-xl text-sm text-label-primary placeholder:text-label-tertiary hover:border-accent-blue/30 focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/20 focus:outline-none transition-all"
              />
            </form>
          </div>

          {/* Stats dashboard */}
          {stats && (
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-2xl border border-surface-separator p-5">
                <p className="text-sm text-label-secondary mb-1">Total Conversations</p>
                <p className="text-3xl font-bold text-label-primary tracking-tight">{stats.totalConversations.toLocaleString()}</p>
                {stats.weekConversations > 0 && (
                  <p className="text-sm text-accent-green mt-1">↑ {stats.weekConversations} this week</p>
                )}
              </div>
              <div className="bg-white rounded-2xl border border-surface-separator p-5">
                <p className="text-sm text-label-secondary mb-1">Total Messages</p>
                <p className="text-3xl font-bold text-label-primary tracking-tight">{stats.totalMessages.toLocaleString()}</p>
                {stats.weekMessages > 0 && (
                  <p className="text-sm text-accent-green mt-1">↑ {stats.weekMessages} this week</p>
                )}
              </div>
              <div className="bg-white rounded-2xl border border-surface-separator p-5">
                <p className="text-sm text-label-secondary mb-1">Apps Used</p>
                <p className="text-3xl font-bold text-label-primary tracking-tight">{stats.appsUsed}</p>
                <p className="text-sm text-label-tertiary mt-1">
                  {stats.appIds.map((id) => appMap[id]?.displayName ?? id).join(' · ')}
                </p>
              </div>
              <div className="bg-white rounded-2xl border border-surface-separator p-5">
                <p className="text-sm text-label-secondary mb-1">Avg. Messages / Chat</p>
                <p className="text-3xl font-bold text-label-primary tracking-tight">{stats.avgMessagesPerChat}</p>
                <p className="text-sm text-label-tertiary mt-1">Last 30 days</p>
              </div>
            </div>
          )}

          {/* Filter chips + date range */}
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            <button
              onClick={() => setFilter('all')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                filter === 'all'
                  ? 'bg-accent-blue text-white'
                  : 'bg-white text-label-secondary border border-surface-separator hover:border-accent-blue/30'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('starred')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                filter === 'starred'
                  ? 'bg-accent-blue text-white'
                  : 'bg-white text-label-secondary border border-surface-separator hover:border-accent-blue/30'
              }`}
            >
              ⭐ Starred
            </button>
            {apps.map((app) => (
              <button
                key={app.id}
                onClick={() => setFilter(app.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  filter === app.id
                    ? 'bg-accent-blue text-white'
                    : 'bg-white text-label-secondary border border-surface-separator hover:border-accent-blue/30'
                }`}
              >
                {app.displayName}
              </button>
            ))}

            {/* Date range inputs */}
            <div className="flex items-center gap-2 ml-auto">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-white border border-surface-separator rounded-lg px-3 py-1.5 text-xs text-label-secondary hover:border-accent-blue/30 focus:border-accent-blue focus:outline-none transition-colors"
              />
              <span className="text-xs text-label-tertiary">–</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-white border border-surface-separator rounded-lg px-3 py-1.5 text-xs text-label-secondary hover:border-accent-blue/30 focus:border-accent-blue focus:outline-none transition-colors"
              />
              {(startDate || endDate) && (
                <button
                  onClick={() => { setStartDate(''); setEndDate(''); }}
                  className="text-xs text-label-tertiary hover:text-label-secondary transition-colors"
                  title="Clear dates"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Session list */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-white rounded-2xl border border-surface-separator p-5 animate-pulse">
                  <div className="h-4 bg-surface-elevated/60 rounded w-2/3 mb-2.5" />
                  <div className="h-3.5 bg-surface-elevated/40 rounded w-full mb-3" />
                  <div className="h-3 bg-surface-elevated/30 rounded w-1/3" />
                </div>
              ))}
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-20 text-label-tertiary">
              <div className="text-5xl mb-4">💬</div>
              <p className="font-medium">No conversations yet</p>
              <p className="text-sm mt-1">Connect an AI app via MCP or install the browser extension</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((s) => {
                const app = appMap[s.appId];
                return (
                  <Link
                    key={s.id}
                    href={`/chats/${s.id}${fromParam}`}
                    className="block bg-white rounded-2xl border border-surface-separator p-5 hover:border-accent-blue/30 hover:shadow-md transition-all group"
                  >
                    {/* Row 1: Title + Badge + Star */}
                    <div className="flex items-center gap-2.5 mb-1">
                      <h3 className="font-semibold text-label-primary truncate group-hover:text-accent-blue transition-colors">
                        {s.title ?? 'Untitled conversation'}
                      </h3>
                      {app ? (
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${app.color}`}>
                          {app.iconUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={app.iconUrl} alt="" className="w-3 h-3 rounded-sm object-contain" />
                          ) : null}
                          {app.displayName}
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 shrink-0">
                          {s.appId}
                        </span>
                      )}
                      <button
                        onClick={(e) => toggleStar(e, s.id, s.starred)}
                        className={`ml-auto p-0.5 rounded transition-colors shrink-0 ${
                          s.starred
                            ? 'text-yellow-500 hover:text-yellow-600'
                            : 'text-label-tertiary opacity-0 group-hover:opacity-100 hover:text-yellow-500'
                        }`}
                        title={s.starred ? 'Unstar' : 'Star'}
                      >
                        {s.starred ? '★' : '☆'}
                      </button>
                    </div>
                    {/* Row 2: Preview */}
                    {s.preview && (
                      <p className="text-sm text-label-secondary leading-relaxed line-clamp-1 mb-2">
                        {s.preview}
                      </p>
                    )}
                    {/* Row 3: Meta */}
                    <div className="flex items-center gap-4 text-xs text-label-tertiary">
                      <span className="inline-flex items-center gap-1">💬 {s.messageCount} messages</span>
                      <span className="inline-flex items-center gap-1">⏱ {formatDuration(s.createdAt, s.updatedAt)}</span>
                      <span className="ml-auto">{formatDate(s.updatedAt)}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
