const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');
const { extractText, chunkText } = require('../services/documentParser');
const { embed } = require('../services/llm');

const embeddingsEnabled = () => String(process.env.ENABLE_EMBEDDINGS || 'true').toLowerCase() === 'true';

const UPLOAD_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `${uuidv4()}-${file.originalname}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PDF, DOCX, DOC, and TXT files are supported'));
  },
});

// All document routes require admin JWT
router.use(requireAdmin);

// GET /api/documents  – list all documents for tenant
router.get('/', (req, res) => {
  const docs = db
    .prepare(`
      SELECT d.id, d.original_name, d.content_type, d.created_at,
             COUNT(c.id) AS chunk_count
      FROM documents d
      LEFT JOIN document_chunks c ON c.document_id = d.id
      WHERE d.tenant_id = ?
      GROUP BY d.id
      ORDER BY d.created_at DESC
    `)
    .all(req.user.tenant_id);

  res.json({ documents: docs });
});

// POST /api/documents/upload
router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const { path: filePath, originalname, mimetype } = req.file;
  const tenantId = req.user.tenant_id;
  const docId = uuidv4();

  try {
    // Extract text
    const text = await extractText(filePath, mimetype);

    // Chunk text
    const chunks = chunkText(text);
    if (chunks.length === 0) {
      fs.unlinkSync(filePath);
      return res.status(422).json({ error: 'Could not extract any text from the file' });
    }

    // Store document record
    db.prepare('INSERT INTO documents (id, tenant_id, original_name, content_type) VALUES (?, ?, ?, ?)')
      .run(docId, tenantId, originalname, mimetype);

    // Store chunks (with optional embeddings)
    const insertChunk = db.prepare(
      'INSERT INTO document_chunks (id, document_id, tenant_id, chunk_text, chunk_index, embedding) VALUES (?, ?, ?, ?, ?, ?)'
    );

    let embeddingErrors = 0;
    for (let i = 0; i < chunks.length; i++) {
      let embeddingJson = null;
      if (embeddingsEnabled()) {
        try {
          const vec = await embed(chunks[i]);
          embeddingJson = JSON.stringify(vec);
        } catch {
          embeddingErrors++;
        }
      }
      insertChunk.run(uuidv4(), docId, tenantId, chunks[i], i, embeddingJson);
    }

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    res.json({
      id: docId,
      originalName: originalname,
      chunkCount: chunks.length,
      embeddingErrors,
      embeddingsEnabled: embeddingsEnabled(),
      message: 'Document uploaded and processed successfully',
    });
  } catch (err) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/documents/:id
router.delete('/:id', (req, res) => {
  const doc = db
    .prepare('SELECT id FROM documents WHERE id = ? AND tenant_id = ?')
    .get(req.params.id, req.user.tenant_id);

  if (!doc) return res.status(404).json({ error: 'Document not found' });

  db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);
  res.json({ message: 'Document deleted' });
});

module.exports = router;
