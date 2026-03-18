const router = require('express').Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { authLimiter } = require('../middleware/rateLimiter');

function hashPassword(p) {
  return crypto.createHash('sha256').update(p).digest('hex');
}

// POST /api/auth/login
router.post('/login', authLimiter, (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });

  const user = db
    .prepare('SELECT * FROM users WHERE email = ?')
    .get(email.toLowerCase().trim());

  if (!user || user.password_hash !== hashPassword(password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { userId: user.id, tenantId: user.tenant_id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );

  res.json({
    token,
    user: { id: user.id, email: user.email, role: user.role, tenantId: user.tenant_id },
  });
});

module.exports = router;
