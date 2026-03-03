'use client';

import { useEffect, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import type { Application, Token } from '@/lib/types';
import { timeAgo, BADGE_PALETTE } from '@/lib/ui';

export default function SettingsPage() {
  const [tab, setTab] = useState<'mcp' | 'tokens' | 'apps' | 'data'>('mcp');
  const [tokens, setTokens] = useState<Token[]>([]);
  const [newTokenName, setNewTokenName] = useState('');
  const [newTokenValue, setNewTokenValue] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [apps, setApps] = useState<Application[]>([]);
  const [editingApp, setEditingApp] = useState<Record<string, string>>({});
  const [editingColor, setEditingColor] = useState<Record<string, number>>({});
  const [savedApp, setSavedApp] = useState<string | null>(null);
  const [mcpUrl, setMcpUrl] = useState('');
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildResult, setRebuildResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    setMcpUrl(`${window.location.origin}/mcp`);
  }, []);

  useEffect(() => {
    if (tab === 'tokens') {
      fetch('/api/tokens').then((r) => r.json()).then((d) => setTokens((d as { tokens: Token[] }).tokens ?? []));
    } else if (tab === 'apps') {
      fetch('/api/applications').then((r) => r.json()).then((d) => {
        const list = (d as { applications: Application[] }).applications ?? [];
        setApps(list);
        setEditingApp(Object.fromEntries(list.map((a) => [a.id, a.displayName])));
        setEditingColor(Object.fromEntries(list.map((a, i) => [a.id, a.colorIndex ?? (i % BADGE_PALETTE.length)])));
      });
    }
  }, [tab]);

  const copy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const createToken = async () => {
    if (!newTokenName.trim()) return;
    const r = await fetch('/api/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newTokenName.trim() }),
    });
    const d = await r.json() as { token: string; id: string; name: string; createdAt: number };
    setNewTokenValue(d.token);
    setNewTokenName('');
    setTokens((prev) => [...prev, { id: d.id, name: d.name, lastUsedAt: null, createdAt: d.createdAt, revokedAt: null }]);
  };

  const revokeToken = async (id: string) => {
    await fetch(`/api/tokens/${id}`, { method: 'DELETE' });
    setTokens((prev) => prev.map((t) => t.id === id ? { ...t, revokedAt: Date.now() } : t));
  };

  const deleteToken = async (id: string) => {
    await fetch(`/api/tokens/${id}`, { method: 'DELETE' });
    setTokens((prev) => prev.filter((t) => t.id !== id));
  };

  const saveAppName = async (appId: string) => {
    const name = editingApp[appId]?.trim();
    const original = apps.find((a) => a.id === appId);
    if (!name || name === original?.displayName) return;
    const res = await fetch(`/api/applications/${appId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: name }),
    });
    if (!res.ok) return;
    setApps((prev) => prev.map((a) => a.id === appId ? { ...a, displayName: name } : a));
    setSavedApp(appId);
    setTimeout(() => setSavedApp(null), 2000);
  };

  const rebuildFts = async () => {
    setRebuilding(true);
    setRebuildResult(null);
    try {
      const res = await fetch('/api/admin/rebuild-fts', { method: 'POST' });
      const data = await res.json() as { rebuilt?: boolean; messages_indexed?: number; embeddings_indexed?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Request failed');
      const parts = [`${data.messages_indexed ?? 0} messages indexed`];
      if (data.embeddings_indexed !== undefined) parts.push(`${data.embeddings_indexed} embeddings rebuilt`);
      setRebuildResult({ ok: true, message: `Done — ${parts.join(', ')}` });
    } catch (err) {
      setRebuildResult({ ok: false, message: String(err instanceof Error ? err.message : err) });
    } finally {
      setRebuilding(false);
    }
  };

  const saveAppColor = async (appId: string, colorIdx: number) => {
    setEditingColor((prev) => ({ ...prev, [appId]: colorIdx }));
    const res = await fetch(`/api/applications/${appId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ colorIndex: colorIdx }),
    });
    if (!res.ok) return;
    setApps((prev) => prev.map((a) => a.id === appId ? { ...a, colorIndex: colorIdx } : a));
    setSavedApp(appId);
    setTimeout(() => setSavedApp(null), 2000);
  };

  return (
    <div className="flex h-screen bg-surface-elevated">
      <Sidebar activePage="settings" />

      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        <div className="px-4 py-5 md:px-8 md:py-8 flex flex-col md:flex-row gap-4 md:gap-6">
          {/* Tab nav — horizontal scroll on mobile, vertical list on desktop */}
          <div className="md:w-44 md:shrink-0">
            <nav className="flex gap-1 overflow-x-auto pb-1 md:pb-0 md:block md:space-y-0.5">
              {([['mcp', '🔌 MCP Server'], ['tokens', '🔑 API Tokens'], ['apps', '📱 Applications'], ['data', '🗄️ Data']] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`shrink-0 md:w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    tab === id ? 'bg-accent-blue/10 text-accent-blue' : 'text-label-secondary hover:bg-surface-elevated'
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* ── MCP Server ── */}
            {tab === 'mcp' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-label-primary mb-1">MCP Server</h2>
                  <p className="text-sm text-label-secondary">
                    Connect any MCP-compatible application by pointing it at the server URL below. Clients that support OAuth 2.0 Dynamic Client Registration will authenticate automatically.
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-surface-separator p-5 space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-label-tertiary uppercase tracking-widest">Server URL</label>
                    <div className="flex items-center gap-2 mt-1.5">
                      <code className="flex-1 bg-surface-elevated rounded-lg px-3 py-2 text-sm font-mono text-label-primary overflow-x-auto">
                        {mcpUrl}
                      </code>
                      <button
                        onClick={() => copy(mcpUrl, 'url')}
                        className="shrink-0 text-xs font-semibold text-accent-blue bg-accent-blue/10 hover:bg-accent-blue/20 rounded-lg px-3 py-2 transition-colors"
                      >
                        {copiedId === 'url' ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-label-tertiary uppercase tracking-widest">Transport</label>
                    <p className="text-sm text-label-secondary mt-1">Streamable HTTP · MCP spec 2025-03-26</p>
                  </div>
                </div>
              </div>
            )}

            {/* ── Applications ── */}
            {tab === 'apps' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-label-primary mb-1">Applications</h2>
                  <p className="text-sm text-label-secondary">
                    Customize how your AI applications appear throughout the dashboard.
                  </p>
                </div>

                <div className="space-y-2">
                  {apps.length === 0 && (
                    <div className="text-center py-10 text-label-tertiary text-sm">No applications yet</div>
                  )}
                  {apps.map((app) => (
                    <div key={app.id} className="bg-white rounded-2xl border border-surface-separator p-4 flex items-center gap-4">
                      {app.iconUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={app.iconUrl} alt="" className="w-8 h-8 rounded-lg object-contain shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-surface-elevated flex items-center justify-center text-label-tertiary text-sm shrink-0">
                          {app.displayName.charAt(0)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-label-tertiary mb-1">{app.id}</p>
                        <input
                          type="text"
                          value={editingApp[app.id] ?? app.displayName}
                          onChange={(e) => setEditingApp((prev) => ({ ...prev, [app.id]: e.target.value }))}
                          onBlur={() => saveAppName(app.id)}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveAppName(app.id); }}
                          className="w-full bg-surface-elevated rounded-lg border border-surface-separator px-3 py-1.5 text-sm text-label-primary focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/20 transition-all"
                        />
                        {/* Color swatch picker */}
                        <div className="flex gap-1.5 mt-2">
                          {BADGE_PALETTE.map((p, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => saveAppColor(app.id, i)}
                              title={`Color ${i + 1}`}
                              className={`w-4 h-4 rounded-full transition-transform ${
                                editingColor[app.id] === i
                                  ? 'ring-2 ring-offset-1 ring-gray-500 scale-110'
                                  : 'hover:scale-110'
                              }`}
                              style={{ backgroundColor: p.swatch }}
                            />
                          ))}
                        </div>
                      </div>
                      {savedApp === app.id && (
                        <span className="text-xs font-medium text-accent-green shrink-0">Saved</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── API Tokens ── */}
            {tab === 'tokens' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-label-primary mb-1">API Tokens</h2>
                  <p className="text-sm text-label-secondary">
                    Tokens are used by MCP clients and browser extensions to upload and search chats. Each token is shown once.
                  </p>
                </div>

                {/* New token shown once */}
                {newTokenValue && (
                  <div className="bg-accent-green/10 border border-accent-green/30 rounded-2xl p-5">
                    <p className="text-sm font-semibold text-accent-green mb-2">Token created — copy it now</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-white rounded-lg px-3 py-2 text-xs font-mono text-label-primary overflow-x-auto border border-surface-separator">
                        {newTokenValue}
                      </code>
                      <button
                        onClick={() => copy(newTokenValue, 'new')}
                        className="shrink-0 text-xs font-semibold text-accent-blue bg-accent-blue/10 rounded-lg px-3 py-2 transition-colors"
                      >
                        {copiedId === 'new' ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <button onClick={() => setNewTokenValue(null)} className="text-xs text-label-tertiary mt-2 hover:text-label-secondary transition-colors">
                      Dismiss
                    </button>
                  </div>
                )}

                {/* Create new token */}
                <div className="bg-white rounded-2xl border border-surface-separator p-5">
                  <label className="text-xs font-semibold text-label-tertiary uppercase tracking-widest">Create new token</label>
                  <div className="flex gap-2 mt-2">
                    <input
                      type="text"
                      value={newTokenName}
                      onChange={(e) => setNewTokenName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && createToken()}
                      placeholder="Token name"
                      className="flex-1 bg-surface-elevated rounded-xl border border-surface-separator px-3 py-2 text-sm focus:outline-none focus:border-accent-blue/50 focus:ring-1 focus:ring-accent-blue/20 transition-all"
                    />
                    <button
                      onClick={createToken}
                      disabled={!newTokenName.trim()}
                      className="text-sm font-semibold text-white bg-accent-blue hover:bg-accent-blue/90 disabled:opacity-40 rounded-xl px-4 py-2 transition-colors"
                    >
                      Create
                    </button>
                  </div>
                </div>

                {/* Token list */}
                <div className="space-y-2">
                  {tokens.length === 0 && (
                    <div className="text-center py-10 text-label-tertiary text-sm">No tokens yet</div>
                  )}
                  {tokens.map((t) => (
                    <div key={t.id} className="bg-white rounded-2xl border border-surface-separator p-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-label-primary text-sm">{t.name}</p>
                        <p className="text-xs text-label-tertiary mt-0.5">
                          Created {timeAgo(t.createdAt)}
                          {t.lastUsedAt && ` · Last used ${timeAgo(t.lastUsedAt)}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {t.revokedAt ? (
                          <>
                            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 text-red-500">Revoked</span>
                            <button
                              onClick={() => deleteToken(t.id)}
                              className="text-xs font-medium text-label-tertiary hover:text-red-500 transition-colors"
                            >
                              Delete
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-accent-green/10 text-accent-green">Active</span>
                            <button
                              onClick={() => revokeToken(t.id)}
                              className="text-xs font-medium text-label-tertiary hover:text-red-500 transition-colors"
                            >
                              Revoke
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Data ── */}
            {tab === 'data' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-label-primary mb-1">Data</h2>
                  <p className="text-sm text-label-secondary">
                    Manage your search index and data maintenance tasks.
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-surface-separator p-5 space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-label-tertiary uppercase tracking-widest">Search Index</label>
                    <p className="text-sm text-label-secondary mt-1.5">
                      Rebuild the full-text search index and embeddings. This re-processes all messages and may take a moment for large databases.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={rebuildFts}
                      disabled={rebuilding}
                      className="text-sm font-semibold text-white bg-accent-blue hover:bg-accent-blue/90 disabled:opacity-50 rounded-xl px-4 py-2 transition-colors flex items-center gap-2"
                    >
                      {rebuilding && (
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      )}
                      {rebuilding ? 'Rebuilding…' : 'Rebuild FTS Index and Embeddings'}
                    </button>
                    {rebuildResult && (
                      <span className={`text-xs font-medium ${rebuildResult.ok ? 'text-accent-green' : 'text-red-500'}`}>
                        {rebuildResult.message}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
