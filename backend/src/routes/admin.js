const router = require('express').Router();
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

router.use(requireAdmin);

// GET /api/admin/tenant  – current tenant info + API key
router.get('/tenant', (req, res) => {
  const tenant = db
    .prepare('SELECT id, name, api_key, created_at FROM tenants WHERE id = ?')
    .get(req.user.tenant_id);

  res.json({ tenant });
});

// PATCH /api/admin/tenant  – update tenant name
router.patch('/tenant', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  db.prepare('UPDATE tenants SET name = ? WHERE id = ?').run(name.trim(), req.user.tenant_id);
  res.json({ message: 'Tenant updated' });
});

// POST /api/admin/tenant/rotate-key  – rotate API key
router.post('/tenant/rotate-key', (req, res) => {
  const newKey = 'sk-' + crypto.randomBytes(24).toString('hex');
  db.prepare('UPDATE tenants SET api_key = ? WHERE id = ?').run(newKey, req.user.tenant_id);
  res.json({ apiKey: newKey });
});

// GET /api/admin/conversations  – list recent conversations
router.get('/conversations', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const conversations = db
    .prepare(`
      SELECT c.id, c.session_id, c.created_at,
             COUNT(m.id) AS message_count,
             MAX(m.created_at) AS last_activity
      FROM conversations c
      LEFT JOIN messages m ON m.conversation_id = c.id
      WHERE c.tenant_id = ?
      GROUP BY c.id
      ORDER BY last_activity DESC
      LIMIT ?
    `)
    .all(req.user.tenant_id, limit);

  res.json({ conversations });
});

// GET /api/admin/conversations/:id  – full conversation messages
router.get('/conversations/:id', (req, res) => {
  const conv = db
    .prepare('SELECT id, session_id, created_at FROM conversations WHERE id = ? AND tenant_id = ?')
    .get(req.params.id, req.user.tenant_id);

  if (!conv) return res.status(404).json({ error: 'Conversation not found' });

  const messages = db
    .prepare('SELECT role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
    .all(conv.id);

  res.json({ conversation: conv, messages });
});

// GET /api/admin/stats
router.get('/stats', (req, res) => {
  const tenantId = req.user.tenant_id;
  const docCount   = db.prepare('SELECT COUNT(*) AS n FROM documents WHERE tenant_id = ?').get(tenantId).n;
  const chunkCount = db.prepare('SELECT COUNT(*) AS n FROM document_chunks WHERE tenant_id = ?').get(tenantId).n;
  const convCount  = db.prepare('SELECT COUNT(*) AS n FROM conversations WHERE tenant_id = ?').get(tenantId).n;
  const msgCount   = db.prepare(`
    SELECT COUNT(*) AS n FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.tenant_id = ?
  `).get(tenantId).n;

  res.json({ documents: docCount, chunks: chunkCount, conversations: convCount, messages: msgCount });
});

module.exports = router;
