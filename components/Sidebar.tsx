'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Application, UserProfile } from '@/lib/types';

interface SidebarProps {
  /** Which page is currently active — highlights the correct nav item */
  activePage: 'chats' | 'search' | 'settings';
  /**
   * Current filter value (only relevant on the chats page).
   * When provided together with onFilterChange, Library/App items become
   * interactive filter buttons instead of navigation links.
   */
  filter?: string;
  onFilterChange?: (filter: string) => void;
}

export default function Sidebar({ activePage, filter, onFilterChange }: SidebarProps) {
  const [apps, setApps] = useState<Application[]>([]);
  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    fetch('/api/applications')
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => setApps((d as { applications: Application[] }).applications ?? []))
      .catch(() => {});
    fetch('/api/user')
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => setUser((d as { user: UserProfile }).user ?? null))
      .catch(() => {});
  }, []);

  // When onFilterChange is provided we're on the chats page — clicking items
  // changes the filter in-place. Otherwise they navigate to /chats.
  const isChatsPage = activePage === 'chats' && onFilterChange;

  const navItemClass = (active: boolean) =>
    `w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
      active ? 'bg-accent-blue/10 text-accent-blue' : 'text-label-secondary hover:bg-surface-elevated'
    }`;

  return (
    <aside className="w-60 bg-white border-r border-surface-separator flex flex-col shrink-0">
      {/* Logo */}
      <div className="p-5 border-b border-surface-separator">
        <Link href="/chats" className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-lg">
            💬
          </div>
          <span className="font-bold text-label-primary">ChatDB</span>
        </Link>
      </div>

      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {/* ── Library ── */}
        <p className="text-xs font-semibold text-label-tertiary uppercase tracking-widest px-3 py-2">Library</p>

        {isChatsPage ? (
          <button onClick={() => onFilterChange('all')} className={navItemClass(filter === 'all')}>
            📚 All Chats
          </button>
        ) : (
          <Link href="/chats" className={navItemClass(activePage === 'chats')}>
            📚 All Chats
          </Link>
        )}

        {isChatsPage ? (
          <button onClick={() => onFilterChange('starred')} className={navItemClass(filter === 'starred')}>
            ⭐ Starred
          </button>
        ) : (
          <Link href="/chats?filter=starred" className={navItemClass(false)}>
            ⭐ Starred
          </Link>
        )}

        {/* ── Applications ── */}
        {apps.length > 0 && (
          <>
            <p className="text-xs font-semibold text-label-tertiary uppercase tracking-widest px-3 py-2 mt-4">
              Applications
            </p>
            {apps.map((app) =>
              isChatsPage ? (
                <button
                  key={app.id}
                  onClick={() => onFilterChange(app.id)}
                  className={navItemClass(filter === app.id)}
                >
                  {app.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={app.iconUrl} alt="" className="w-4 h-4 rounded-sm object-contain shrink-0" />
                  ) : (
                    <span className="w-4 h-4 rounded-sm bg-surface-elevated flex items-center justify-center text-[10px] font-bold text-label-tertiary shrink-0">{app.displayName.charAt(0).toUpperCase()}</span>
                  )}
                  {app.displayName}
                </button>
              ) : (
                <Link
                  key={app.id}
                  href={`/chats?filter=${app.id}`}
                  className={navItemClass(false)}
                >
                  {app.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={app.iconUrl} alt="" className="w-4 h-4 rounded-sm object-contain shrink-0" />
                  ) : (
                    <span className="w-4 h-4 rounded-sm bg-surface-elevated flex items-center justify-center text-[10px] font-bold text-label-tertiary shrink-0">{app.displayName.charAt(0).toUpperCase()}</span>
                  )}
                  {app.displayName}
                </Link>
              )
            )}
          </>
        )}

        {/* ── More ── */}
        <p className="text-xs font-semibold text-label-tertiary uppercase tracking-widest px-3 py-2 mt-4">More</p>
        <Link href="/search" className={navItemClass(activePage === 'search')}>
          🔍 Search
        </Link>
        <Link href="/settings" className={navItemClass(activePage === 'settings')}>
          ⚙️ Settings
        </Link>
      </nav>

      {/* User profile */}
      {user && (
        <div className="p-3 border-t border-surface-separator">
          <div className="flex items-center gap-3 px-2 py-2">
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatarUrl} alt="" className="w-9 h-9 rounded-full shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-purple-600 flex items-center justify-center text-white text-sm font-semibold shrink-0">
                {user.username.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-label-primary truncate">{user.username}</p>
              <p className="text-xs text-label-tertiary truncate">@{user.username}</p>
            </div>
            <form action="/api/signout" method="POST">
              <button
                type="submit"
                className="text-xs text-label-tertiary hover:text-label-secondary transition-colors shrink-0"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </aside>
  );
}
