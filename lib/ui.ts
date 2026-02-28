// Shared UI constants and formatting helpers

import type { Application } from './types';

/** Rotating palette for app badges when no iconUrl is available */
export const BADGE_COLORS = [
  'bg-orange-100 text-orange-700',
  'bg-green-100 text-green-700',
  'bg-blue-100 text-blue-700',
  'bg-purple-100 text-purple-700',
  'bg-yellow-100 text-yellow-700',
  'bg-pink-100 text-pink-700',
  'bg-gray-100 text-gray-600',
];

/** Build a lookup map from app ID → display info */
export function buildAppMap(apps: Application[]) {
  return Object.fromEntries(
    apps.map((app, i) => [
      app.id,
      { displayName: app.displayName, iconUrl: app.iconUrl, color: BADGE_COLORS[i % BADGE_COLORS.length] },
    ]),
  );
}

/** "Today, 3:42 PM" / "Yesterday, 9:00 AM" / "Jan 5, 3:42 PM" */
export function formatDate(ms: number) {
  const d = new Date(ms);
  const now = new Date();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `Today, ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + `, ${time}`;
}

/** "< 1 min" / "23 min" / "1h 15m" */
export function formatDuration(startMs: number, endMs: number) {
  const mins = Math.round((endMs - startMs) / 60_000);
  if (mins < 1) return '< 1 min';
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const remainder = mins % 60;
  return remainder > 0 ? `${hrs}h ${remainder}m` : `${hrs}h`;
}

/** "just now" / "5m ago" / "3h ago" / "Jan 15, 2025" */
export function timeAgo(ms: number) {
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ms).toLocaleDateString();
}

/** Convert "YYYY-MM-DD" → start-of-day (or end-of-day) ms, or null */
export function dateStrToMs(s: string, endOfDay = false): number | null {
  if (!s) return null;
  const d = new Date(s + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  if (endOfDay) d.setHours(23, 59, 59, 999);
  return d.getTime();
}
