const jwt = require('jsonwebtoken');
const db = require('../db/database');

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.prepare('SELECT id, tenant_id, email, role FROM users WHERE id = ?').get(payload.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

// Middleware that resolves tenant from API key (for public chat endpoint)
function resolveApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'Missing X-Api-Key header' });

  const tenant = db.prepare('SELECT id, name FROM tenants WHERE api_key = ?').get(apiKey);
  if (!tenant) return res.status(401).json({ error: 'Invalid API key' });

  req.tenant = tenant;
  next();
}

module.exports = { requireAuth, requireAdmin, resolveApiKey };
