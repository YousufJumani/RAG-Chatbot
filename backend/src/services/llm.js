const fetch = require('node-fetch');

const BASE_URL = () => process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
const API_KEY  = () => process.env.LLM_API_KEY;
const MODEL    = () => process.env.LLM_MODEL || 'gpt-4o-mini';
const EMBED_MODEL = () => process.env.LLM_EMBED_MODEL || 'text-embedding-3-small';

async function chat(messages, { systemPrompt } = {}) {
  const allMessages = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages;

  const response = await fetch(`${BASE_URL()}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY()}`,
    },
    body: JSON.stringify({
      model: MODEL(),
      messages: allMessages,
      temperature: 0.7,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`LLM API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function embed(text) {
  const response = await fetch(`${BASE_URL()}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY()}`,
    },
    body: JSON.stringify({
      model: EMBED_MODEL(),
      input: text,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Embedding API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.data[0].embedding; // float[]
}

module.exports = { chat, embed };
