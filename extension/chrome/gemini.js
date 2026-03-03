// ChatDB — Gemini platform adapter
// Loaded before content.js on gemini.google.com pages.

window.__chatdbPlatform = (() => {
  'use strict';

  function isConversationPage() {
    return /\/(app|share|gem)\//.test(location.pathname);
  }

  function extractConversation(domToMarkdown) {
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

  function findInjectionPoint() {
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
      const shareWrapper = shareBtn.closest('.buttons-container.share') || shareBtn.parentElement;
      return { parent: shareWrapper.parentElement, before: shareWrapper };
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
        return { parent: container, before: container.firstChild };
      }
    }

    return null;
  }

  function getSidebarLinks() {
    const links = document.querySelectorAll('a.conversation');
    const result = [];
    for (const link of links) {
      const href = link.getAttribute('href');
      if (!href) continue;
      result.push({
        fullUrl: new URL(href, location.origin).href,
        linkEl: link,
        titleEl: link.querySelector('.conversation-title'),
      });
    }
    return result;
  }

  return {
    appName: 'Gemini',
    isConversationPage,
    extractConversation,
    findInjectionPoint,
    getSidebarLinks,
  };
})();
