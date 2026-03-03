// ChatDB extension — background service worker
// Handles the ingest API call to bypass CORS restrictions.

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.action.openPopup();
  }
});

// Shared helper: get cleaned URL and token from storage
async function getConfig() {
  const { chatdb_url, chatdb_token } = await chrome.storage.sync.get([
    'chatdb_url',
    'chatdb_token',
  ]);

  if (!chatdb_url || !chatdb_token) return null;

  return {
    url: chatdb_url.trim().replace(/[^\x20-\x7E]/g, ''),
    token: chatdb_token.trim().replace(/[^\x20-\x7E]/g, ''),
  };
}

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'chatdb_ingest') {
    handleIngest(message, sendResponse);
    return true;
  }
  if (message.type === 'chatdb_lookup') {
    handleLookup(message, sendResponse);
    return true;
  }
  return false;
});

// POST /api/ingest
async function handleIngest(message, sendResponse) {
  try {
    const config = await getConfig();
    if (!config) {
      sendResponse({ error: 'Please configure ChatDB in the extension popup' });
      return;
    }

    const resp = await fetch(`${config.url}/api/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.token}`,
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
}

// GET /api/ingest/lookup?source_url=…
async function handleLookup(message, sendResponse) {
  try {
    const config = await getConfig();
    if (!config) {
      sendResponse({ error: 'not_configured' });
      return;
    }

    const url = `${config.url}/api/ingest/lookup?source_url=${encodeURIComponent(message.source_url)}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${config.token}` },
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
}
