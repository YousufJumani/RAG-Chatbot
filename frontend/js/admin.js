(() => {
  const API = '/api';
  let token = localStorage.getItem('adminToken') || null;

  // ── Helpers ────────────────────────────────────────────────────────────────
  async function apiFetch(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(API + path, { ...opts, headers });
    if (res.status === 401) { signOut(); return; }
    return res;
  }

  function show(id)  { document.getElementById(id)?.classList.remove('hidden'); }
  function hide(id)  { document.getElementById(id)?.classList.add('hidden'); }
  function el(id)    { return document.getElementById(id); }

  // ── Auth ───────────────────────────────────────────────────────────────────
  el('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    hide('login-error');
    const email    = el('login-email').value.trim();
    const password = el('login-password').value;

    try {
      const res  = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      token = data.token;
      localStorage.setItem('adminToken', token);
      showDashboard();
    } catch (err) {
      const errEl = el('login-error');
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });

  function signOut() {
    token = null;
    localStorage.removeItem('adminToken');
    hide('dashboard-screen');
    show('login-screen');
  }
  el('logout-btn').addEventListener('click', signOut);

  // ── Dashboard init ─────────────────────────────────────────────────────────
  async function showDashboard() {
    hide('login-screen');
    el('dashboard-screen').classList.remove('hidden');
    await Promise.all([loadStats(), loadApiKey(), loadDocuments(), loadConversations()]);
    loadSettings();
  }

  // ── Section navigation ─────────────────────────────────────────────────────
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
      btn.classList.add('active');
      el(`section-${btn.dataset.section}`).classList.remove('hidden');
    });
  });

  // ── Stats ──────────────────────────────────────────────────────────────────
  async function loadStats() {
    const res  = await apiFetch('/admin/stats');
    if (!res || !res.ok) return;
    const data = await res.json();
    el('stat-docs').textContent   = data.documents;
    el('stat-chunks').textContent = data.chunks;
    el('stat-convs').textContent  = data.conversations;
    el('stat-msgs').textContent   = data.messages;
  }

  // ── API key ────────────────────────────────────────────────────────────────
  async function loadApiKey() {
    const res  = await apiFetch('/admin/tenant');
    if (!res || !res.ok) return;
    const { tenant } = await res.json();
    el('api-key-value').textContent = tenant.api_key;
    localStorage.setItem('chatApiKey', tenant.api_key);
    el('tenant-name').value = tenant.name;
  }

  el('copy-key-btn').addEventListener('click', () => {
    const key = el('api-key-value').textContent;
    navigator.clipboard.writeText(key).then(() => {
      el('copy-key-btn').textContent = 'Copied!';
      setTimeout(() => { el('copy-key-btn').textContent = 'Copy'; }, 1800);
    });
  });

  el('rotate-key-btn').addEventListener('click', async () => {
    if (!confirm('Rotate the API key? The old key will stop working immediately.')) return;
    const res  = await apiFetch('/admin/tenant/rotate-key', { method: 'POST' });
    if (!res || !res.ok) return;
    const data = await res.json();
    el('api-key-value').textContent = data.apiKey;
    localStorage.setItem('chatApiKey', data.apiKey);
  });

  // ── Documents ──────────────────────────────────────────────────────────────
  async function loadDocuments() {
    const res  = await apiFetch('/documents');
    if (!res || !res.ok) return;
    const { documents } = await res.json();
    renderDocuments(documents);
  }

  function renderDocuments(docs) {
    const list = el('documents-list');
    if (docs.length === 0) {
      list.innerHTML = '<p class="muted">No documents yet. Upload some files above.</p>';
      return;
    }
    list.innerHTML = docs.map(d => `
      <div class="doc-item" data-id="${d.id}">
        <div>
          <div class="doc-item__name">${escHtml(d.original_name)}</div>
          <div class="doc-item__meta">${d.chunk_count} chunks · ${new Date(d.created_at).toLocaleDateString()}</div>
        </div>
        <button class="btn btn--sm btn--danger doc-item__del" data-id="${d.id}">Delete</button>
      </div>
    `).join('');

    list.querySelectorAll('.doc-item__del').forEach(btn => {
      btn.addEventListener('click', () => deleteDocument(btn.dataset.id));
    });
  }

  async function deleteDocument(id) {
    if (!confirm('Delete this document and all its chunks?')) return;
    const res = await apiFetch(`/documents/${id}`, { method: 'DELETE' });
    if (res && res.ok) {
      await loadDocuments();
      await loadStats();
    }
  }

  // ── Upload ─────────────────────────────────────────────────────────────────
  const uploadZone = el('upload-zone');
  const fileInput  = el('file-input');

  uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('dragover'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
  uploadZone.addEventListener('drop', e => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    uploadFiles(Array.from(e.dataTransfer.files));
  });

  fileInput.addEventListener('change', () => {
    uploadFiles(Array.from(fileInput.files));
    fileInput.value = '';
  });

  async function uploadFiles(files) {
    const progressEl = el('upload-progress');
    progressEl.innerHTML = '';
    progressEl.classList.remove('hidden');

    for (const file of files) {
      const item = document.createElement('div');
      item.className = 'upload-progress-item';
      item.innerHTML = `<span>${escHtml(file.name)}</span><span class="status">Uploading…</span>`;
      progressEl.appendChild(item);

      const formData = new FormData();
      formData.append('file', file);

      try {
        const res  = await fetch(`${API}/documents/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        const data = await res.json();
        if (res.ok) {
          item.classList.add('ok');
          item.querySelector('.status').textContent = `✓ ${data.chunkCount} chunks`;
        } else {
          throw new Error(data.error);
        }
      } catch (err) {
        item.classList.add('err');
        item.querySelector('.status').textContent = `✗ ${err.message}`;
      }
    }

    await loadDocuments();
    await loadStats();
  }

  // ── Conversations ──────────────────────────────────────────────────────────
  async function loadConversations() {
    const res = await apiFetch('/admin/conversations');
    if (!res || !res.ok) return;
    const { conversations } = await res.json();
    renderConvList(conversations);
  }

  function renderConvList(convs) {
    const list = el('conv-list');
    if (convs.length === 0) {
      list.innerHTML = '<p class="muted" style="padding:16px">No conversations yet.</p>';
      return;
    }
    list.innerHTML = convs.map(c => `
      <div class="conv-list-item" data-id="${c.id}">
        <div class="conv-list-item__id">${c.session_id.slice(0, 8)}…</div>
        <div class="conv-list-item__meta">${c.message_count} messages · ${c.last_activity ? new Date(c.last_activity).toLocaleString() : ''}</div>
      </div>
    `).join('');

    list.querySelectorAll('.conv-list-item').forEach(item => {
      item.addEventListener('click', () => {
        list.querySelectorAll('.conv-list-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        loadConversationDetail(item.dataset.id);
      });
    });
  }

  async function loadConversationDetail(id) {
    const detail = el('conv-detail');
    detail.innerHTML = '<p class="muted">Loading…</p>';

    const res = await apiFetch(`/admin/conversations/${id}`);
    if (!res || !res.ok) return;
    const { messages } = await res.json();

    if (messages.length === 0) {
      detail.innerHTML = '<p class="muted empty-hint">No messages.</p>';
      return;
    }
    detail.innerHTML = messages.map(m => `
      <div class="conv-msg ${m.role}">${escHtml(m.content)}</div>
    `).join('');
    detail.scrollTop = detail.scrollHeight;
  }

  // ── Settings ───────────────────────────────────────────────────────────────
  function loadSettings() {} // prefilled by loadApiKey

  el('settings-form').addEventListener('submit', async e => {
    e.preventDefault();
    const name = el('tenant-name').value.trim();
    hide('settings-msg');

    const res  = await apiFetch('/admin/tenant', {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
    const data = res && await res.json();
    const msg  = el('settings-msg');
    if (res && res.ok) {
      msg.textContent = 'Saved!';
      msg.className = 'success-msg';
    } else {
      msg.textContent = data?.error || 'Failed to save';
      msg.className = 'error-msg';
    }
    msg.classList.remove('hidden');
    setTimeout(() => msg.classList.add('hidden'), 3000);
  });

  // ── Utils ──────────────────────────────────────────────────────────────────
  function escHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Boot ───────────────────────────────────────────────────────────────────
  if (token) {
    showDashboard();
  }
})();
