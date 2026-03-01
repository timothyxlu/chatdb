'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Application, UserProfile } from '@/lib/types';
import { BADGE_PALETTE } from '@/lib/ui';

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
  const [mobileOpen, setMobileOpen] = useState(false);

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

  const closeMenu = () => setMobileOpen(false);

  // When onFilterChange is provided we're on the chats page — clicking items
  // changes the filter in-place. Otherwise they navigate to /chats.
  const isChatsPage = activePage === 'chats' && onFilterChange;

  const navItemClass = (active: boolean) =>
    `w-full flex items-center gap-2 px-3 py-2.5 md:py-2 rounded-lg text-sm font-medium transition-colors text-left ${
      active ? 'bg-accent-blue/10 text-accent-blue' : 'text-label-secondary hover:bg-surface-elevated'
    }`;

  return (
    <>
      {/* ── Mobile top bar ── */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 h-14 bg-white border-b border-surface-separator flex items-center px-4 gap-3">
        <button
          onClick={() => setMobileOpen(true)}
          className="w-10 h-10 flex items-center justify-center rounded-xl text-label-secondary hover:bg-surface-elevated transition-colors"
          aria-label="Open menu"
        >
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <Link href="/chats" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-base">
            💬
          </div>
          <span className="font-bold text-label-primary">ChatDB</span>
        </Link>
      </div>

      {/* ── Backdrop ── */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40"
          onClick={closeMenu}
        />
      )}

      {/* ── Sidebar drawer ── */}
      <aside className={[
        'fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-surface-separator flex flex-col shrink-0',
        'transition-transform duration-300 ease-in-out',
        'md:relative md:inset-auto md:z-auto md:w-60 md:translate-x-0 md:transition-none',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
      ].join(' ')}>
        {/* Logo */}
        <div className="p-5 border-b border-surface-separator">
          <div className="flex items-center justify-between">
            <Link href="/chats" className="flex items-center gap-2.5" onClick={closeMenu}>
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-lg">
                💬
              </div>
              <span className="font-bold text-label-primary">ChatDB</span>
            </Link>
            {/* Close button — mobile only */}
            <button
              onClick={closeMenu}
              className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg text-label-tertiary hover:bg-surface-elevated transition-colors"
              aria-label="Close menu"
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {/* ── Library ── */}
          <p className="text-xs font-semibold text-label-tertiary uppercase tracking-widest px-3 py-2">Library</p>

          {isChatsPage ? (
            <button onClick={() => { onFilterChange('all'); closeMenu(); }} className={navItemClass(filter === 'all')}>
              📚 All Chats
            </button>
          ) : (
            <Link href="/chats" className={navItemClass(activePage === 'chats')} onClick={closeMenu}>
              📚 All Chats
            </Link>
          )}

          {isChatsPage ? (
            <button onClick={() => { onFilterChange('starred'); closeMenu(); }} className={navItemClass(filter === 'starred')}>
              ⭐ Starred
            </button>
          ) : (
            <Link href="/chats?filter=starred" className={navItemClass(false)} onClick={closeMenu}>
              ⭐ Starred
            </Link>
          )}

          {/* ── Applications ── */}
          {apps.length > 0 && (
            <>
              <p className="text-xs font-semibold text-label-tertiary uppercase tracking-widest px-3 py-2 mt-4">
                Applications
              </p>
              {apps.map((app, i) => {
                const palette = BADGE_PALETTE[app.colorIndex ?? (i % BADGE_PALETTE.length)];
                const iconStyle = { backgroundColor: palette.swatch + '33', color: palette.swatch };
                const icon = app.iconUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={app.iconUrl} alt="" className="w-4 h-4 rounded-sm object-contain shrink-0" />
                ) : (
                  <span className="w-4 h-4 rounded-sm flex items-center justify-center text-[10px] font-bold shrink-0" style={iconStyle}>
                    {app.displayName.charAt(0).toUpperCase()}
                  </span>
                );
                return isChatsPage ? (
                  <button
                    key={app.id}
                    onClick={() => { onFilterChange(app.id); closeMenu(); }}
                    className={navItemClass(filter === app.id)}
                  >
                    {icon}
                    {app.displayName}
                  </button>
                ) : (
                  <Link
                    key={app.id}
                    href={`/chats?filter=${app.id}`}
                    className={navItemClass(false)}
                    onClick={closeMenu}
                  >
                    {icon}
                    {app.displayName}
                  </Link>
                );
              })}
            </>
          )}

          {/* ── More ── */}
          <p className="text-xs font-semibold text-label-tertiary uppercase tracking-widest px-3 py-2 mt-4">More</p>
          <Link href="/search" className={navItemClass(activePage === 'search')} onClick={closeMenu}>
            🔍 Search
          </Link>
          <Link href="/settings" className={navItemClass(activePage === 'settings')} onClick={closeMenu}>
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
    </>
  );
}
