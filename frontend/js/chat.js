(() => {
  // ── Config ──────────────────────────────────────────────────────────────────
  // The API key is the tenant's public key embedded for the widget.
  // In a real embed scenario this comes from a <script data-api-key="…"> tag.
  let apiKey = document.currentScript?.dataset?.apiKey
    || localStorage.getItem('chatApiKey')
    || 'PASTE_YOUR_API_KEY_HERE';

  const API_BASE = '/api';

  // ── State ───────────────────────────────────────────────────────────────────
  let sessionId = sessionStorage.getItem('chatSessionId') || null;

  // ── DOM refs ─────────────────────────────────────────────────────────────────
  const messagesEl      = document.getElementById('messages');
  const formEl          = document.getElementById('chat-form');
  const inputEl         = document.getElementById('user-input');
  const typingIndicator = document.getElementById('typing-indicator');

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function appendMessage(role, text) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  function setTyping(visible) {
    typingIndicator.classList.toggle('hidden', !visible);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function hasValidApiKey() {
    return Boolean(apiKey && apiKey !== 'PASTE_YOUR_API_KEY_HERE');
  }

  async function refreshApiKeyFromAdminToken() {
    const adminToken = localStorage.getItem('adminToken');
    if (!adminToken) return false;

    try {
      const res = await fetch(`${API_BASE}/admin/tenant`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!res.ok) return false;

      const data = await res.json();
      const nextKey = data?.tenant?.api_key;
      if (!nextKey) return false;

      apiKey = nextKey;
      localStorage.setItem('chatApiKey', nextKey);
      return true;
    } catch {
      return false;
    }
  }

  async function refreshApiKeyFromPublicConfig() {
    try {
      const res = await fetch(`${API_BASE}/chat/config`);
      if (!res.ok) return false;

      const data = await res.json();
      const nextKey = data?.apiKey;
      if (!nextKey) return false;

      apiKey = nextKey;
      localStorage.setItem('chatApiKey', nextKey);
      return true;
    } catch {
      return false;
    }
  }

  async function ensureApiKey() {
    if (hasValidApiKey()) return true;
    if (await refreshApiKeyFromAdminToken()) return true;
    if (await refreshApiKeyFromPublicConfig()) return true;
    return false;
  }

  // ── Load history on page load ────────────────────────────────────────────────
  async function loadHistory() {
    if (!(await ensureApiKey())) return;
    if (!sessionId) return;
    try {
      const r = await fetch(`${API_BASE}/chat/history?sessionId=${sessionId}`, {
        headers: { 'X-Api-Key': apiKey },
      });
      if (!r.ok) return;
      const { messages } = await r.json();
      messages.forEach(m => appendMessage(m.role, m.content));
    } catch { /* ignore */ }
  }

  async function postChat(text) {
    return fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': apiKey,
      },
      body: JSON.stringify({ message: text, sessionId }),
    });
  }

  // ── Send message ─────────────────────────────────────────────────────────────
  async function sendMessage(text) {
    if (!(await ensureApiKey())) {
      appendMessage('error', 'Chat is temporarily unavailable. Please try again in a moment.');
      return;
    }

    appendMessage('user', text);
    inputEl.value = '';
    inputEl.disabled = true;
    setTyping(true);

    try {
      let res = await postChat(text);
      let data = await res.json();

      if (!res.ok && data?.error === 'Invalid API key') {
        const refreshed = (await refreshApiKeyFromAdminToken()) || (await refreshApiKeyFromPublicConfig());
        if (refreshed) {
          res = await postChat(text);
          data = await res.json();
        }
      }

      if (!res.ok) {
        appendMessage('error', data.error || 'Something went wrong. Please try again.');
      } else {
        sessionId = data.sessionId;
        sessionStorage.setItem('chatSessionId', sessionId);
        appendMessage('assistant', data.reply);
      }
    } catch {
      appendMessage('error', 'Network error. Please check your connection.');
    } finally {
      setTyping(false);
      inputEl.disabled = false;
      inputEl.focus();
    }
  }

  // ── Event listeners ───────────────────────────────────────────────────────────
  formEl.addEventListener('submit', e => {
    e.preventDefault();
    const text = inputEl.value.trim();
    if (text) sendMessage(text);
  });

  // ── Init ──────────────────────────────────────────────────────────────────────
  appendMessage('assistant', 'Hello! How can I help you today?');
  loadHistory();
})();
