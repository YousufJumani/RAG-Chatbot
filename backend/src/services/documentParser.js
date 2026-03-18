const fs = require('fs');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

const CHUNK_SIZE = 800;     // characters per chunk
const CHUNK_OVERLAP = 150;  // overlap between chunks

async function extractText(filePath, mimeType) {
  if (mimeType === 'application/pdf') {
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    return data.text;
  }

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  if (mimeType === 'text/plain') {
    return fs.readFileSync(filePath, 'utf8');
  }

  throw new Error(`Unsupported file type: ${mimeType}`);
}

function chunkText(text) {
  const chunks = [];
  let start = 0;

  // Normalise whitespace
  const clean = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

  while (start < clean.length) {
    const end = start + CHUNK_SIZE;
    chunks.push(clean.slice(start, end).trim());
    start = end - CHUNK_OVERLAP;
    if (start >= clean.length) break;
  }

  return chunks.filter(c => c.length > 30); // drop tiny tail chunks
}

module.exports = { extractText, chunkText };
