require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const db = require('./database');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function generateApiKey() {
  return 'sk-' + crypto.randomBytes(24).toString('hex');
}

function seed() {
  const tenantName = process.env.DEFAULT_TENANT_NAME || 'My Business';
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'changeme123';

  // Check if already seeded
  const existing = db.prepare('SELECT id FROM tenants LIMIT 1').get();
  if (existing) {
    console.log('Database already seeded. Skipping.');
    return;
  }

  const tenantId = uuidv4();
  const apiKey = generateApiKey();

  db.prepare(`
    INSERT INTO tenants (id, name, api_key) VALUES (?, ?, ?)
  `).run(tenantId, tenantName, apiKey);

  const userId = uuidv4();
  db.prepare(`
    INSERT INTO users (id, tenant_id, email, password_hash, role)
    VALUES (?, ?, ?, ?, 'admin')
  `).run(userId, tenantId, adminEmail, hashPassword(adminPassword));

  console.log('=== Seed complete ===');
  console.log(`Tenant:    ${tenantName}`);
  console.log(`API Key:   ${apiKey}`);
  console.log(`Admin:     ${adminEmail}`);
  console.log(`Password:  ${adminPassword}`);
  console.log('====================');
}

seed();
