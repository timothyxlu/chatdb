// ChatDB — ChatGPT platform adapter
// Loaded before content.js on chatgpt.com pages.

window.__chatdbPlatform = (() => {
  'use strict';

  function isConversationPage() {
    return /^\/c\//.test(location.pathname);
  }

  function extractConversation(domToMarkdown) {
    const turns = document.querySelectorAll('article[data-testid^="conversation-turn-"]');

    if (turns.length === 0) {
      throw new Error('No messages found on this page');
    }

    const messages = [];

    for (const turn of turns) {
      const role = turn.getAttribute('data-turn');

      if (role === 'user') {
        const textEl = turn.querySelector('.whitespace-pre-wrap');
        const text = textEl?.textContent?.trim();
        if (text) {
          messages.push({ role: 'user', content: text });
        }
      } else if (role === 'assistant') {
        const markdownEl = turn.querySelector('.markdown');
        if (markdownEl) {
          const content = domToMarkdown(markdownEl);
          if (content) {
            messages.push({ role: 'assistant', content });
          }
        }
      }
    }

    // Title from document.title, stripping " | ChatGPT" or " - ChatGPT" suffix
    let title = document.title?.replace(/\s*[|\-–]\s*ChatGPT\s*$/i, '').trim() || null;

    // Fallback: active sidebar link
    if (!title) {
      title = document.querySelector('nav a[data-active] .truncate span')?.textContent?.trim() || null;
    }

    // Final fallback: first user message
    if (!title) {
      const firstUser = messages.find((m) => m.role === 'user');
      title = firstUser?.content.slice(0, 80) || 'Untitled';
    }

    return { title, messages, sourceUrl: location.href };
  }

  function findInjectionPoint() {
    const shareBtn = document.querySelector('button[data-testid="share-chat-button"]');
    if (shareBtn) {
      return { parent: shareBtn.parentElement, before: shareBtn };
    }

    // Fallback: header right section
    const header = document.querySelector('header');
    if (header) {
      const rightSection = header.querySelector('.flex.items-center.justify-end');
      if (rightSection) {
        return { parent: rightSection, before: rightSection.firstChild };
      }
    }

    return null;
  }

  function getSidebarLinks() {
    const links = document.querySelectorAll('nav a[data-sidebar-item="true"][href^="/c/"]');
    const result = [];
    for (const link of links) {
      const href = link.getAttribute('href');
      if (!href) continue;
      result.push({
        fullUrl: new URL(href, location.origin).href,
        linkEl: link,
        titleEl: link.querySelector('.truncate'),
      });
    }
    return result;
  }

  return {
    appName: 'ChatGPT',
    isConversationPage,
    extractConversation,
    findInjectionPoint,
    getSidebarLinks,
  };
})();
