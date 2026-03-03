// ChatDB extension — shared content script core
// Platform adapters (gemini.js or chatgpt.js) must load before this file
// and set window.__chatdbPlatform with: { appName, isConversationPage,
// extractConversation, findInjectionPoint, getSidebarLinks }.

(() => {
  'use strict';

  const platform = window.__chatdbPlatform;
  if (!platform) {
    console.warn('[ChatDB] No platform adapter found');
    return;
  }

  // ── Constants ─────────────────────────────────────────────

  const CHATDB_ICON_SVG = `
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="8" fill="url(#chatdb-g)"/>
      <rect x="7" y="8" width="18" height="13" rx="4" fill="white" fill-opacity="0.95"/>
      <polygon points="12,21 16,21 12,25" fill="white" fill-opacity="0.95"/>
      <defs>
        <linearGradient id="chatdb-g" x1="0" y1="0" x2="32" y2="32">
          <stop stop-color="#6366f1"/>
          <stop offset="1" stop-color="#8b5cf6"/>
        </linearGradient>
      </defs>
    </svg>`;

  const CHECK_SVG = `<svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="6" cy="6" r="6" fill="#16a34a"/>
    <path d="M3.5 6.2 5.2 7.9 8.5 4.5" stroke="white" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const SIDEBAR_CHECK_SVG = CHECK_SVG;

  // ── Helpers ───────────────────────────────────────────────

  function toast(msg, type = 'ok') {
    const el = document.createElement('div');
    el.className = `chatdb-toast ${type}`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  // ── DOM to Markdown ───────────────────────────────────────

  function domToMarkdown(container) {
    const parts = [];

    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        parts.push(node.textContent);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const tag = node.tagName.toLowerCase();

      // Images → markdown ![alt](src)
      if (tag === 'img') {
        const src = node.src || node.getAttribute('src') || '';
        const alt = node.alt || '';
        if (src && !src.startsWith('data:')) {
          parts.push(`\n![${alt}](${src})\n`);
        }
        return;
      }

      // Code blocks
      if (tag === 'code' && node.parentElement?.tagName.toLowerCase() === 'pre') {
        const lang = Array.from(node.classList)
          .find((c) => c.startsWith('language-'))
          ?.replace('language-', '') || '';
        parts.push(`\n\`\`\`${lang}\n${node.textContent}\n\`\`\`\n`);
        return;
      }
      if (tag === 'pre') {
        const code = node.querySelector('code');
        if (code) { walk(code); return; }
        parts.push(`\n\`\`\`\n${node.textContent}\n\`\`\`\n`);
        return;
      }

      // Inline code
      if (tag === 'code') {
        parts.push(`\`${node.textContent}\``);
        return;
      }

      // Headings
      if (/^h[1-6]$/.test(tag)) {
        const level = '#'.repeat(parseInt(tag[1]));
        parts.push(`\n${level} `);
        for (const child of node.childNodes) walk(child);
        parts.push('\n');
        return;
      }

      // Bold
      if (tag === 'strong' || tag === 'b') {
        parts.push('**');
        for (const child of node.childNodes) walk(child);
        parts.push('**');
        return;
      }

      // Italic
      if (tag === 'em' || tag === 'i') {
        parts.push('*');
        for (const child of node.childNodes) walk(child);
        parts.push('*');
        return;
      }

      // Links
      if (tag === 'a') {
        const img = node.querySelector('img');
        if (img) {
          const src = img.src || img.getAttribute('src') || '';
          const alt = img.alt || '';
          if (src && !src.startsWith('data:')) {
            parts.push(`\n![${alt}](${src})\n`);
          }
          return;
        }
        const href = node.href || '';
        const text = node.textContent.trim();
        if (href && text) {
          parts.push(`[${text}](${href})`);
          return;
        }
      }

      // List items — skip whitespace-only text nodes (HTML formatting indentation)
      if (tag === 'li') {
        const parent = node.parentElement?.tagName.toLowerCase();
        const prefix = parent === 'ol'
          ? `${Array.from(node.parentElement.children).indexOf(node) + 1}. `
          : '- ';
        parts.push(`\n${prefix}`);
        for (const child of node.childNodes) {
          if (child.nodeType === Node.TEXT_NODE && !child.textContent.trim()) continue;
          walk(child);
        }
        return;
      }

      // <p> inside <li> — don't add extra newlines
      if (tag === 'p' && node.parentElement?.tagName.toLowerCase() === 'li') {
        for (const child of node.childNodes) walk(child);
        return;
      }

      // Block elements
      if (['p', 'div', 'br', 'ul', 'ol', 'table', 'blockquote'].includes(tag)) {
        if (tag === 'br') { parts.push('\n'); return; }
        parts.push('\n');
        for (const child of node.childNodes) walk(child);
        parts.push('\n');
        return;
      }

      // Default: recurse
      for (const child of node.childNodes) walk(child);
    }

    walk(container);

    return parts
      .join('')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // ── Lookup status ─────────────────────────────────────────

  function formatTime(ms) {
    const d = new Date(ms);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
      + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  function markSynced(btn, scrapedAt) {
    if (btn.querySelector('.chatdb-check')) return;
    const badge = document.createElement('span');
    badge.className = 'chatdb-check';
    badge.innerHTML = CHECK_SVG;
    btn.appendChild(badge);

    const tip = document.createElement('span');
    tip.className = 'chatdb-tip';
    tip.textContent = `Updated ${formatTime(scrapedAt)}`;
    btn.appendChild(tip);

    btn.removeAttribute('title');
  }

  async function checkLookup(btn) {
    if (!platform.isConversationPage()) return;
    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'chatdb_lookup',
        source_url: location.href,
      });
      if (resp?.ok && resp.data?.exists) {
        markSynced(btn, resp.data.scraped_at || resp.data.scraped_at === 0 ? resp.data.scraped_at : Date.now());
      }
    } catch {
      // Silently ignore — lookup is best-effort
    }
  }

  // ── Send to ChatDB ────────────────────────────────────────

  async function saveToBackend() {
    const btn = document.querySelector('.chatdb-btn');
    if (btn) btn.classList.add('saving');

    try {
      const { title, messages, sourceUrl } = platform.extractConversation(domToMarkdown);

      const payload = {
        app: platform.appName,
        title,
        messages,
        overwrite: true,
        metadata: {
          source_url: sourceUrl,
          scraped_at: Math.floor(Date.now() / 1000),
        },
      };

      const resp = await chrome.runtime.sendMessage({
        type: 'chatdb_ingest',
        payload,
      });

      if (resp.error) {
        throw new Error(resp.error);
      }

      const count = resp.data?.message_count || messages.length;
      if (resp.data?.overwritten) {
        toast(`Updated ${count} messages in ChatDB`);
      } else {
        toast(`Saved ${count} messages to ChatDB`);
      }
      // Show checkmark after successful save
      if (btn) markSynced(btn, Date.now());
    } catch (err) {
      toast(`Failed: ${err.message}`, 'err');
    } finally {
      if (btn) btn.classList.remove('saving');
    }
  }

  // ── Inject button ─────────────────────────────────────────

  function createButton() {
    const btn = document.createElement('button');
    btn.className = 'chatdb-btn';
    btn.title = 'Save to ChatDB';
    btn.innerHTML = CHATDB_ICON_SVG;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      saveToBackend();
    });
    return btn;
  }

  function injectButton() {
    if (!platform.isConversationPage()) return;

    // Already present for this URL — skip
    const existing = document.querySelector('.chatdb-btn');
    if (existing && existing.dataset.url === location.href) return;
    // URL changed — remove stale button so we re-inject with fresh lookup
    if (existing) existing.remove();

    const point = platform.findInjectionPoint();
    if (!point) return;

    const btn = createButton();
    btn.dataset.url = location.href;
    point.parent.insertBefore(btn, point.before || null);
    checkLookup(btn);
  }

  // ── Sidebar sync badges ───────────────────────────────────

  let sidebarLookupPending = false;

  async function checkSidebarLookup() {
    if (sidebarLookupPending) return;

    const sidebarLinks = platform.getSidebarLinks();
    if (sidebarLinks.length === 0) return;

    // Build URL → sidebar item mapping
    const urlMap = new Map();
    for (const item of sidebarLinks) {
      urlMap.set(item.fullUrl, item);
    }

    if (urlMap.size === 0) return;

    sidebarLookupPending = true;
    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'chatdb_batch_lookup',
        source_urls: Array.from(urlMap.keys()),
      });

      if (!resp?.ok || !resp.data?.results) return;

      for (const [url, result] of Object.entries(resp.data.results)) {
        if (!result) continue;
        const item = urlMap.get(url);
        if (!item) continue;
        // Already has badge — skip
        if (item.linkEl.querySelector('.chatdb-sidebar-check')) continue;

        const badge = document.createElement('span');
        badge.className = 'chatdb-sidebar-check';
        badge.innerHTML = SIDEBAR_CHECK_SVG;
        // Insert before the title element
        if (item.titleEl) {
          item.titleEl.parentElement.insertBefore(badge, item.titleEl);
        } else {
          item.linkEl.prepend(badge);
        }
      }
    } catch {
      // Silently ignore — sidebar badges are best-effort
    } finally {
      sidebarLookupPending = false;
    }
  }

  // ── SPA navigation handling ───────────────────────────────

  let lastUrl = location.href;

  function onRouteChange() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      document.querySelector('.chatdb-btn')?.remove();
      setTimeout(injectButton, 1000);
    }
  }

  const origPush = history.pushState;
  history.pushState = function (...args) {
    origPush.apply(this, args);
    onRouteChange();
  };
  const origReplace = history.replaceState;
  history.replaceState = function (...args) {
    origReplace.apply(this, args);
    onRouteChange();
  };
  window.addEventListener('popstate', onRouteChange);

  // ── Init ──────────────────────────────────────────────────

  let sidebarScanTimer = null;
  const observer = new MutationObserver(() => {
    if (platform.isConversationPage()) {
      const btn = document.querySelector('.chatdb-btn');
      if (!btn || btn.dataset.url !== location.href) {
        injectButton();
      }
    }
    // Debounce sidebar scan
    if (!sidebarScanTimer) {
      sidebarScanTimer = setTimeout(() => {
        sidebarScanTimer = null;
        checkSidebarLookup();
      }, 2000);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  console.log(`[ChatDB] Content script loaded (${platform.appName}), isConversationPage:`, platform.isConversationPage());
  injectButton();
  setTimeout(() => {
    injectButton();
    checkSidebarLookup();
  }, 2000);
})();
