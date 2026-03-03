// ChatDB extension — Gemini content script
// Injects a "Save to ChatDB" button next to the share button in Gemini chat pages.

(() => {
  'use strict';

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

  // ── Helpers ──────────────────────────────────────────────

  function toast(msg, type = 'ok') {
    const el = document.createElement('div');
    el.className = `chatdb-toast ${type}`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }

  function isConversationPage() {
    return /\/(app|share|gem)\//.test(location.pathname);
  }

  // ── DOM to Markdown ──────────────────────────────────────

  function domToMarkdown(container) {
    // Walk the DOM tree and convert to markdown, preserving images
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
        // If pre has a code child, let the code handler deal with it
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

      // Headings — recurse into children to preserve links/bold
      if (/^h[1-6]$/.test(tag)) {
        const level = '#'.repeat(parseInt(tag[1]));
        parts.push(`\n${level} `);
        for (const child of node.childNodes) walk(child);
        parts.push('\n');
        return;
      }

      // Bold — recurse into children to preserve links
      if (tag === 'strong' || tag === 'b') {
        parts.push('**');
        for (const child of node.childNodes) walk(child);
        parts.push('**');
        return;
      }

      // Italic — recurse into children
      if (tag === 'em' || tag === 'i') {
        parts.push('*');
        for (const child of node.childNodes) walk(child);
        parts.push('*');
        return;
      }

      // Links — check for image inside first
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

      // List items
      if (tag === 'li') {
        const parent = node.parentElement?.tagName.toLowerCase();
        const prefix = parent === 'ol'
          ? `${Array.from(node.parentElement.children).indexOf(node) + 1}. `
          : '- ';
        parts.push(`\n${prefix}`);
        for (const child of node.childNodes) walk(child);
        return;
      }

      // <p> inside <li> — don't add extra newlines
      if (tag === 'p' && node.parentElement?.tagName.toLowerCase() === 'li') {
        for (const child of node.childNodes) walk(child);
        return;
      }

      // Block elements → add newlines
      if (['p', 'div', 'br', 'ul', 'ol', 'table', 'blockquote'].includes(tag)) {
        if (tag === 'br') { parts.push('\n'); return; }
        parts.push('\n');
        for (const child of node.childNodes) walk(child);
        parts.push('\n');
        return;
      }

      // Default: recurse into children
      for (const child of node.childNodes) walk(child);
    }

    walk(container);

    return parts
      .join('')
      .replace(/\n{3,}/g, '\n\n')  // collapse excess newlines
      .trim();
  }

  // ── Extract conversation ────────────────────────────────

  function extractConversation() {
    const userEls = document.querySelectorAll('user-query');
    const respEls = document.querySelectorAll('response-container');

    if (userEls.length === 0) {
      throw new Error('No messages found on this page');
    }

    const messages = [];

    userEls.forEach((q, i) => {
      // Extract user text, filtering Angular comment nodes
      const lines = q.querySelectorAll('.query-text-line');
      let userText;
      if (lines.length > 0) {
        userText = Array.from(lines)
          .map((line) =>
            Array.from(line.childNodes)
              .filter((n) => n.nodeType === Node.TEXT_NODE)
              .map((n) => n.textContent)
              .join('')
          )
          .join('\n')
          .trim();
      } else {
        // Fallback: strip "You said\n" prefix from innerText
        userText = q.innerText.replace(/^You said\n/, '').trim();
      }

      if (userText) {
        messages.push({ role: 'user', content: userText });
      }

      // Matching response — extract only the model response text,
      // skipping "Show thinking" and "Gemini said" screen-reader elements
      if (respEls[i]) {
        const contentEl =
          respEls[i].querySelector('.model-response-text') ||
          respEls[i].querySelector('structured-content-container') ||
          respEls[i];
        const modelText = domToMarkdown(contentEl);
        if (modelText) {
          messages.push({ role: 'assistant', content: modelText });
        }
      }
    });

    // Extract title from the top bar header
    // Gemini shows: .conversation-title-container > span.conversation-title-column > span.gds-title-m
    let title =
      document.querySelector('.conversation-title-container .gds-title-m')?.textContent?.trim() ||
      document.querySelector('.conversation-title-container')?.textContent?.trim() ||
      document.querySelector('.center-section')?.textContent?.trim() ||
      null;

    // Final fallback: first user message
    if (!title) {
      const firstUser = messages.find((m) => m.role === 'user');
      title = firstUser?.content.slice(0, 80) || 'Untitled';
    }

    return { title, messages, sourceUrl: location.href };
  }

  // ── Lookup status ──────────────────────────────────────

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
    btn.title = `Saved to ChatDB · ${formatTime(scrapedAt)}`;
  }

  async function checkLookup(btn) {
    if (!isConversationPage()) return;
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

  // ── Send to ChatDB ─────────────────────────────────────

  async function saveToBackend() {
    const btn = document.querySelector('.chatdb-btn');
    if (btn) btn.classList.add('saving');

    try {
      const { title, messages, sourceUrl } = extractConversation();

      const payload = {
        app: 'Gemini',
        title,
        messages,
        metadata: {
          source_url: sourceUrl,
          scraped_at: Math.floor(Date.now() / 1000),
        },
      };

      // Send to background service worker (bypasses CORS)
      const resp = await chrome.runtime.sendMessage({
        type: 'chatdb_ingest',
        payload,
      });

      if (resp.error) {
        throw new Error(resp.error);
      }

      if (resp.data?.created === false) {
        toast('Already saved to ChatDB');
      } else {
        toast(`Saved ${resp.data?.message_count || messages.length} messages to ChatDB`);
      }
      // Show checkmark after successful save
      if (btn) markSynced(btn, Date.now());
    } catch (err) {
      toast(`Failed: ${err.message}`, 'err');
    } finally {
      if (btn) btn.classList.remove('saving');
    }
  }

  // ── Inject button ───────────────────────────────────────

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
    // Don't inject on non-conversation pages
    if (!isConversationPage()) return;

    // Already present for this URL — skip
    const existing = document.querySelector('.chatdb-btn');
    if (existing && existing.dataset.url === location.href) return;
    // URL changed — remove stale button so we re-inject with fresh lookup
    if (existing) existing.remove();

    // Find the share button in Gemini's top bar
    // Gemini uses: button[aria-label="Share conversation"] inside div.buttons-container.share
    //   → parent: div.buttons-container → div.right-section → div.top-bar-actions
    const shareSelectors = [
      'button[aria-label="Share conversation"]',
      'button[aria-label="Share"]',
      '.buttons-container.share button',
    ];

    let shareBtn = null;
    for (const sel of shareSelectors) {
      shareBtn = document.querySelector(sel);
      if (shareBtn) break;
    }

    if (shareBtn) {
      // Insert ChatDB button before the share button's container
      const btn = createButton();
      btn.dataset.url = location.href;
      const shareWrapper = shareBtn.closest('.buttons-container.share') || shareBtn.parentElement;
      shareWrapper.parentElement.insertBefore(btn, shareWrapper);
      checkLookup(btn);
      return;
    }

    // Fallback: look for the top-right section of the top bar
    const fallbackSelectors = [
      '.top-bar-actions .right-section',
      '.top-bar-actions',
      '.right-section',
    ];

    for (const sel of fallbackSelectors) {
      const container = document.querySelector(sel);
      if (container) {
        const btn = createButton();
        btn.dataset.url = location.href;
        container.prepend(btn);
        checkLookup(btn);
        return;
      }
    }
  }

  // ── SPA navigation handling ─────────────────────────────

  let lastUrl = location.href;

  function onRouteChange() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      // Remove old button on navigation
      document.querySelector('.chatdb-btn')?.remove();
      // Wait for new page to render, then inject
      setTimeout(injectButton, 1000);
    }
  }

  // Intercept pushState/replaceState for SPA navigation
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

  // ── Init ────────────────────────────────────────────────

  // Gemini is an SPA, elements may not exist yet. Use MutationObserver.
  // Also detects URL changes that pushState interception may miss (e.g. sidebar clicks).
  const observer = new MutationObserver(() => {
    if (!isConversationPage()) return;
    const btn = document.querySelector('.chatdb-btn');
    if (!btn || btn.dataset.url !== location.href) {
      injectButton();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Also try immediately and after a short delay
  console.log('[ChatDB] Content script loaded, isConversationPage:', isConversationPage());
  injectButton();
  setTimeout(() => {
    console.log('[ChatDB] Retrying inject, share btn:', !!document.querySelector('button[aria-label="Share conversation"]'));
    injectButton();
  }, 2000);
})();
