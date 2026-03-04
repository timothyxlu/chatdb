const $ = (id) => document.getElementById(id);

function setStatus(text, type) {
  const status = $('status');
  status.textContent = text;
  status.className = `status ${type}`;
}

function normalizeConfigUrl(raw) {
  const normalized = raw.trim().replace(/\/+$/, '');
  if (!normalized) {
    throw new Error('Please enter a URL');
  }

  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error('Please enter a valid URL');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('URL must start with https:// (or http://localhost)');
  }

  if (parsed.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) {
    throw new Error('Only localhost can use http://. Use https:// for remote hosts.');
  }

  return {
    url: normalized,
    originPattern: `${parsed.origin}/*`,
  };
}

function requestOriginPermission(originPattern) {
  return new Promise((resolve, reject) => {
    chrome.permissions.request({ origins: [originPattern] }, (granted) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(granted);
    });
  });
}

// Load saved settings
chrome.storage.sync.get(['chatdb_url', 'chatdb_token'], (data) => {
  if (data.chatdb_url) $('url').value = data.chatdb_url;
  if (data.chatdb_token) $('token').value = data.chatdb_token;
});

$('save').addEventListener('click', async () => {
  const rawUrl = $('url').value;
  const token = $('token').value.trim();
  let config;

  try {
    config = normalizeConfigUrl(rawUrl);
  } catch (err) {
    setStatus(err.message, 'err');
    return;
  }

  if (!token) {
    setStatus('Please enter a token', 'err');
    return;
  }

  try {
    const granted = await requestOriginPermission(config.originPattern);
    if (!granted) {
      setStatus('Permission denied. Please allow access to this ChatDB host.', 'err');
      return;
    }
  } catch (err) {
    setStatus(`Permission request failed: ${err.message}`, 'err');
    return;
  }

  chrome.storage.sync.set({ chatdb_url: config.url, chatdb_token: token }, () => {
    setStatus('Saved!', 'ok');
    setTimeout(() => {
      $('status').textContent = '';
    }, 2000);
  });
});
