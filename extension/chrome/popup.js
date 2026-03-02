const $ = (id) => document.getElementById(id);

// Load saved settings
chrome.storage.sync.get(['chatdb_url', 'chatdb_token'], (data) => {
  if (data.chatdb_url) $('url').value = data.chatdb_url;
  if (data.chatdb_token) $('token').value = data.chatdb_token;
});

$('save').addEventListener('click', () => {
  const url = $('url').value.trim().replace(/\/+$/, '');
  const token = $('token').value.trim();
  const status = $('status');

  if (!url) {
    status.textContent = 'Please enter a URL';
    status.className = 'status err';
    return;
  }
  if (!token) {
    status.textContent = 'Please enter a token';
    status.className = 'status err';
    return;
  }

  chrome.storage.sync.set({ chatdb_url: url, chatdb_token: token }, () => {
    status.textContent = 'Saved!';
    status.className = 'status ok';
    setTimeout(() => { status.textContent = ''; }, 2000);
  });
});
