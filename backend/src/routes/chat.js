const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { chat } = require('../services/llm');
const { buildSystemPrompt } = require('../services/rag');
const { resolveApiKey } = require('../middleware/auth');
const { chatLimiter } = require('../middleware/rateLimiter');

// GET /api/chat/config
// Public bootstrap endpoint for widget-style chat integration.
router.get('/config', (req, res) => {
  const tenant = db
    .prepare('SELECT id, name, api_key FROM tenants ORDER BY created_at ASC LIMIT 1')
    .get();

  if (!tenant) {
    return res.status(503).json({ error: 'Chat is not configured yet' });
  }

  res.json({ apiKey: tenant.api_key, tenantName: tenant.name });
});

// All chat routes require a valid tenant API key
router.use(resolveApiKey);
router.use(chatLimiter);

// POST /api/chat
// Body: { message: string, sessionId?: string }
router.post('/', async (req, res) => {
  const { message, sessionId: incomingSessionId } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  const tenantId = req.tenant.id;
  const sessionId = incomingSessionId || uuidv4();

  // Get or create conversation
  let conversation = db
    .prepare('SELECT id FROM conversations WHERE tenant_id = ? AND session_id = ?')
    .get(tenantId, sessionId);

  if (!conversation) {
    const convId = uuidv4();
    db.prepare('INSERT INTO conversations (id, tenant_id, session_id) VALUES (?, ?, ?)')
      .run(convId, tenantId, sessionId);
    conversation = { id: convId };
  }

  // Store user message
  db.prepare('INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)')
    .run(uuidv4(), conversation.id, 'user', message.trim());

  // Build history (last 10 messages)
  const history = db
    .prepare('SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 20')
    .all(conversation.id);

  // Build RAG system prompt
  let systemPrompt;
  try {
    systemPrompt = await buildSystemPrompt(tenantId, message);
  } catch {
    systemPrompt = 'You are a helpful AI customer support assistant.';
  }

  // Call LLM
  let reply;
  try {
    reply = await chat(history, { systemPrompt });
  } catch (err) {
    console.error('LLM error:', err.message);
    return res.status(502).json({ error: 'Failed to get response from AI' });
  }

  // Store assistant message
  db.prepare('INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)')
    .run(uuidv4(), conversation.id, 'assistant', reply);

  res.json({ reply, sessionId });
});

// GET /api/chat/history?sessionId=xxx
router.get('/history', (req, res) => {
  const { sessionId } = req.query;
  if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

  const tenantId = req.tenant.id;
  const conversation = db
    .prepare('SELECT id FROM conversations WHERE tenant_id = ? AND session_id = ?')
    .get(tenantId, sessionId);

  if (!conversation) return res.json({ messages: [] });

  const messages = db
    .prepare('SELECT role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
    .all(conversation.id);

  res.json({ messages });
});

module.exports = router;
