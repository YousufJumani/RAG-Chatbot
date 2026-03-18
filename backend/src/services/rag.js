const db = require('../db/database');
const { embed } = require('./llm');

/**
 * Compute cosine similarity between two vectors.
 */
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Keyword-based fallback search when embeddings are unavailable.
 */
function keywordSearch(tenantId, query, topK = 5) {
  const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const chunks = db
    .prepare('SELECT id, chunk_text FROM document_chunks WHERE tenant_id = ?')
    .all(tenantId);

  const scored = chunks.map(chunk => {
    const lower = chunk.chunk_text.toLowerCase();
    const score = keywords.reduce((s, kw) => s + (lower.includes(kw) ? 1 : 0), 0);
    return { ...chunk, score };
  });

  return scored
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(c => c.chunk_text);
}

/**
 * Retrieve the most relevant chunks for a query using embeddings or keyword fallback.
 */
async function retrieveContext(tenantId, query, topK = 5) {
  // Check if any chunks for this tenant have embeddings
  const sample = db
    .prepare('SELECT embedding FROM document_chunks WHERE tenant_id = ? AND embedding IS NOT NULL LIMIT 1')
    .get(tenantId);

  if (!sample) {
    // No embeddings stored – use keyword search
    return keywordSearch(tenantId, query, topK);
  }

  let queryEmbedding;
  try {
    queryEmbedding = await embed(query);
  } catch {
    return keywordSearch(tenantId, query, topK);
  }

  const chunks = db
    .prepare('SELECT chunk_text, embedding FROM document_chunks WHERE tenant_id = ? AND embedding IS NOT NULL')
    .all(tenantId);

  const scored = chunks.map(chunk => {
    const vec = JSON.parse(chunk.embedding);
    return { text: chunk.chunk_text, score: cosineSimilarity(queryEmbedding, vec) };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(c => c.text);
}

/**
 * Build a system prompt with retrieved context injected.
 */
async function buildSystemPrompt(tenantId, userQuery) {
  const contexts = await retrieveContext(tenantId, userQuery);

  const hasContext = contexts.length > 0;
  const contextBlock = hasContext
    ? `Use the following knowledge base excerpts to answer the user's question:\n\n${contexts.map((c, i) => `[${i + 1}] ${c}`).join('\n\n')}`
    : 'No specific knowledge base content is available; answer using general knowledge.';

  return `You are a helpful and friendly AI customer support assistant.
${contextBlock}

Guidelines:
- Be concise and accurate.
- If the answer is not in the provided context, say so honestly.
- Do not make up information.
- Respond in the same language the user uses.`;
}

module.exports = { retrieveContext, buildSystemPrompt };
