# AI Customer Support Chatbot (RAG)

A multi-tenant customer support chatbot with:
- Admin dashboard for tenant management and document upload
- Public chat widget/API for end users
- Retrieval-augmented generation (RAG)
- OpenRouter-compatible LLM integration

## Project Structure

- `backend/`: Express API, SQLite database, auth, RAG logic
- `frontend/`: Chat UI and Admin dashboard (served by backend)

## Tech Stack

- Backend: Node.js, Express, better-sqlite3
- Auth: JWT + tenant API keys
- File ingestion: PDF/DOCX/TXT parsing + chunking
- LLM: OpenAI-compatible APIs (configured for OpenRouter)
- Retrieval: Embeddings when enabled, keyword fallback when disabled

## Current Recommended Mode (Fast + Free)

This repo is configured for a deadline-friendly free setup:
- Chat model via OpenRouter free tier
- Embeddings disabled (`ENABLE_EMBEDDINGS=false`)
- RAG fallback via keyword retrieval

This keeps core functionality working with no embedding API cost.

## Prerequisites

- Node.js 18+
- npm

## Setup

1. Install backend dependencies:

```bash
cd backend
npm install
```

2. Configure environment:

```bash
cp .env.example .env
```

Then update at least:
- `LLM_API_KEY` (your OpenRouter key)
- `JWT_SECRET` (long random string)

3. Seed database:

```bash
npm run seed
```

4. Start server:

```bash
npm start
```

Server runs at `http://localhost:3001`.

## Access Points

- Chat UI: `http://localhost:3001/`
- Admin UI: `http://localhost:3001/admin/`
- Health check: `http://localhost:3001/api/health`

## Admin Login (Seed Defaults)

From `.env`:
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

## Core API Endpoints

- `POST /api/auth/login`
- `GET /api/admin/tenant`
- `GET /api/admin/stats`
- `GET /api/documents`
- `POST /api/documents/upload`
- `POST /api/chat` (requires `X-Api-Key`)
- `GET /api/chat/history?sessionId=...`

## Smoke Test Status (Verified)

Verified locally:
- Health endpoint responds OK
- Admin login works
- Tenant API key retrieval works
- Chat endpoint returns valid LLM response
- Documents list endpoint works

## Notes on RAG Quality

- With `ENABLE_EMBEDDINGS=false`, retrieval uses keyword fallback.
- This is reliable for core functionality but less semantic than vector search.
- For stronger RAG later, enable embeddings and re-index documents.

## Security Notes

- Do not commit `.env`.
- Rotate any API keys that were ever shared in logs/screenshots.
- Rotate tenant API key from Admin dashboard if needed.

## Submission Checklist

- [ ] `.env` uses your own keys/secrets
- [ ] App starts with `npm start`
- [ ] Login works on `/admin/`
- [ ] At least one chat exchange succeeds
- [ ] `.env` is not tracked by git
