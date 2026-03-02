// ChatDB extension — background service worker
// Handles the ingest API call to bypass CORS restrictions.

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.action.openPopup();
  }
});

// Listen for ingest requests from content scripts
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'chatdb_ingest') return false;

  // Handle async response
  (async () => {
    try {
      const { chatdb_url, chatdb_token } = await chrome.storage.sync.get([
        'chatdb_url',
        'chatdb_token',
      ]);

      if (!chatdb_url || !chatdb_token) {
        sendResponse({ error: 'Please configure ChatDB in the extension popup' });
        return;
      }

      // Strip non-ASCII chars (copy-paste can introduce invisible Unicode)
      const cleanUrl = chatdb_url.trim().replace(/[^\x20-\x7E]/g, '');
      const cleanToken = chatdb_token.trim().replace(/[^\x20-\x7E]/g, '');

      const resp = await fetch(`${cleanUrl}/api/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cleanToken}`,
        },
        body: JSON.stringify(message.payload),
      });

      const data = await resp.json();

      if (!resp.ok) {
        sendResponse({ error: data.error || `HTTP ${resp.status}` });
      } else {
        sendResponse({ ok: true, data });
      }
    } catch (err) {
      sendResponse({ error: err.message });
    }
  })();

  // Return true to keep the message channel open for async sendResponse
  return true;
});
