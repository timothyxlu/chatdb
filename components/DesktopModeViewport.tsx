'use client';

import { useEffect } from 'react';

/**
 * Detects when a mobile device requests desktop mode (e.g. Safari's
 * "Request Desktop Website") and widens the viewport so CSS media-query
 * breakpoints (Tailwind `md:` = 768px) activate, showing the desktop layout.
 *
 * How it works:
 *   - In desktop mode, Safari sends a macOS UA (no mobile keywords).
 *   - But the physical screen is still small (< 768 CSS-px) and touch-capable.
 *   - We override `width=device-width` → `width=1024` so the page renders at
 *     1024px and Safari zooms out to fit, just like a real desktop site.
 *
 * This does NOT affect normal mobile browsing (mobile UA → no override).
 */
export function DesktopModeViewport() {
  useEffect(() => {
    const hasMobileUA = /iPhone|iPad|iPod|Android|Mobile/i.test(
      navigator.userAgent,
    );
    const hasTouch = navigator.maxTouchPoints > 0;
    const isSmallScreen = Math.min(screen.width, screen.height) < 768;
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      ('standalone' in navigator &&
        (navigator as unknown as { standalone: boolean }).standalone === true);

    // Desktop UA + touch-capable + small physical screen
    // → almost certainly a phone that switched to desktop mode
    // But skip if running as installed PWA (standalone also lacks mobile UA)
    if (!hasMobileUA && hasTouch && isSmallScreen && !isStandalone) {
      const meta = document.querySelector('meta[name="viewport"]');
      if (meta) {
        meta.setAttribute('content', 'width=1024, viewport-fit=cover');
      }
    }
  }, []);

  return null;
}
