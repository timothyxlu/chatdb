// ChatDB — DeepSeek platform adapter
// Loaded before content.js on chat.deepseek.com pages.

window.__chatdbPlatform = (() => {
  'use strict';

  function isConversationPage() {
    return /\/a\/chat\/s\//.test(location.pathname);
  }

  function extractConversation(domToMarkdown) {
    const msgEls = document.querySelectorAll('.ds-message');

    if (msgEls.length === 0) {
      throw new Error('No messages found on this page');
    }

    const messages = [];

    for (const el of msgEls) {
      const markdownEl = el.querySelector('.ds-markdown');
      if (markdownEl) {
        // Assistant message
        const content = domToMarkdown(markdownEl);
        if (content) {
          messages.push({ role: 'assistant', content });
        }
      } else {
        // User message — plain text
        const text = el.textContent?.trim();
        if (text) {
          messages.push({ role: 'user', content: text });
        }
      }
    }

    // Title from document.title, stripping " - DeepSeek" suffix
    let title = document.title?.replace(/\s*-\s*DeepSeek\s*$/i, '').trim() || null;

    // Final fallback: first user message
    if (!title) {
      const firstUser = messages.find((m) => m.role === 'user');
      title = firstUser?.content.slice(0, 80) || 'Untitled';
    }

    return { title, messages, sourceUrl: location.href };
  }

  function findInjectionPoint() {
    // The top bar (title + share button) is the previous sibling of the chat
    // scroll area that contains .ds-message elements.  Walk up from the first
    // message until we find an ancestor whose previousElementSibling is a
    // short bar (<80px tall) containing a .ds-icon-button.
    const msg = document.querySelector('.ds-message');
    if (msg) {
      let el = msg;
      while (el && el !== document.body) {
        el = el.parentElement;
        const sib = el?.previousElementSibling;
        if (sib && sib.offsetHeight > 20 && sib.offsetHeight < 80) {
          const iconBtn = sib.querySelector('.ds-icon-button[role="button"]');
          if (iconBtn) {
            return { parent: sib, before: iconBtn };
          }
        }
      }
    }

    return null;
  }

  function getSidebarLinks() {
    const links = document.querySelectorAll('a[href^="/a/chat/s/"]');
    const result = [];
    for (const link of links) {
      const href = link.getAttribute('href');
      if (!href) continue;
      // Title is in the second child div (after ds-focus-ring)
      const children = link.children;
      let titleEl = null;
      for (const child of children) {
        if (!child.classList.contains('ds-focus-ring') && child.textContent?.trim()) {
          titleEl = child;
          break;
        }
      }
      result.push({
        fullUrl: new URL(href, location.origin).href,
        linkEl: link,
        titleEl,
      });
    }
    return result;
  }

  return {
    appName: 'DeepSeek',
    isConversationPage,
    extractConversation,
    findInjectionPoint,
    getSidebarLinks,
  };
})();
