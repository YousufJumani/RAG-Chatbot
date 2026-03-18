const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

const isVercel = Boolean(process.env.VERCEL);
const DB_DIR = isVercel ? '/tmp' : path.join(__dirname, '../../data');
const DB_PATH = path.join(DB_DIR, 'chatbot.db');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id        TEXT PRIMARY KEY,
      name      TEXT NOT NULL,
      api_key   TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      email         TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'admin',
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, email)
    );

    CREATE TABLE IF NOT EXISTS documents (
      id           TEXT PRIMARY KEY,
      tenant_id    TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      original_name TEXT NOT NULL,
      content_type TEXT NOT NULL,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS document_chunks (
      id          TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      tenant_id   TEXT NOT NULL,
      chunk_text  TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      embedding   TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_tenant ON document_chunks(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_docs_tenant   ON documents(tenant_id);

    CREATE TABLE IF NOT EXISTS conversations (
      id         TEXT PRIMARY KEY,
      tenant_id  TEXT NOT NULL,
      session_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id              TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role            TEXT NOT NULL,
      content         TEXT NOT NULL,
      created_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
  `);
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function generateApiKey() {
  return 'sk-' + crypto.randomBytes(24).toString('hex');
}

function bootstrapDefaultsIfNeeded() {
  const existingTenant = db.prepare('SELECT id FROM tenants LIMIT 1').get();
  if (existingTenant) return;

  const tenantName = process.env.DEFAULT_TENANT_NAME || 'My Business';
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase().trim();
  const adminPassword = process.env.ADMIN_PASSWORD || 'changeme123';

  const tenantId = uuidv4();
  const userId = uuidv4();
  const apiKey = generateApiKey();

  db.prepare('INSERT INTO tenants (id, name, api_key) VALUES (?, ?, ?)')
    .run(tenantId, tenantName, apiKey);

  db.prepare('INSERT INTO users (id, tenant_id, email, password_hash, role) VALUES (?, ?, ?, ?, ?)')
    .run(userId, tenantId, adminEmail, hashPassword(adminPassword), 'admin');

  console.log('Bootstrapped default tenant and admin user.');
}

initSchema();
bootstrapDefaultsIfNeeded();

module.exports = db;
