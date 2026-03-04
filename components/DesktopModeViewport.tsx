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

    // Desktop UA + touch-capable + small physical screen
    // → almost certainly a phone that switched to desktop mode
    if (!hasMobileUA && hasTouch && isSmallScreen) {
      const meta = document.querySelector('meta[name="viewport"]');
      if (meta) {
        meta.setAttribute('content', 'width=1024, viewport-fit=cover');
      }
    }
  }, []);

  return null;
}
