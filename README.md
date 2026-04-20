# Secure Credential Drop
**Self-Destructing Password Sharer — S&S Tech Services Technical Assessment**

> **Instructions for the candidate**
> This README is your submission report. Fill in every section marked `_Write here_` before submitting.
> Do not remove or reorder sections — the reviewer reads this top to bottom.

---

## Table of Contents
1. [Candidate Info](#1-candidate-info)
2. [Project Overview](#2-project-overview)
3. [Tech Stack & Decisions](#3-tech-stack--decisions)
4. [Project Structure](#4-project-structure)
5. [Setup & Run](#5-setup--run)
6. [Environment Variables](#6-environment-variables)
7. [API Reference](#7-api-reference)
8. [Challenge 1 — Race Condition Prevention](#8-challenge-1--race-condition-prevention)
9. [Challenge 2 — Crawler / Bot Protection](#9-challenge-2--crawler--bot-protection)
10. [Challenge 3 — Resilient Cleanup](#10-challenge-3--resilient-cleanup)
11. [Trade-offs & What I'd Do Differently](#11-trade-offs--what-id-do-differently)

---

## 1. Candidate Info

| | |
|---|---|
| **Name** | _Write here_ |
| **Email** | _Write here_ |
| **Submission date** | _Write here_ |
| **Time taken** | _Write here_ |

---

## 2. Project Overview

> Describe what the service does and the end-to-end user flow in 3–5 sentences.

_Write here_

---

## 3. Tech Stack & Decisions

| Layer | Technology | Why chosen |
|-------|-----------|------------|
| Runtime | Node.js | _Write here_ |
| Framework | Express | _Write here_ |
| Database | PostgreSQL | _Write here_ |
| Encryption | Node.js `crypto` | _Write here_ |

---

## 4. Project Structure

```
/project-root
  ├── /api
  │    ├── server.js              Express entry point, DB pool, cleanup job
  │    ├── /routes/secrets.js     POST (Create) & GET (Retrieve/Burn)
  │    └── /utils/crypto.js       AES-256-GCM encrypt / decrypt
  ├── /db
  │    └── schema.sql             Table: id, encrypted_body, expires_at, is_viewed
  ├── /web
  │    └── index.html             Single-page UI — create form and reveal page
  ├── package.json
  ├── docker-compose.yml
  └── .env
```

---

## 5. Setup & Run

**Prerequisites:** Node.js 18+, PostgreSQL 14+

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Fill in DATABASE_URL and MASTER_KEY — see Section 6

# 3. Initialise the database
npm run db:init

# 4. Start the server
npm run dev       # development (nodemon)
npm start         # production
```

Open `web/index.html` in a browser (e.g. VS Code Live Server on port 5500).

**Local PostgreSQL via Docker:**
```bash
docker-compose up -d
```

---

## 6. Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string — `postgresql://user:pass@localhost:5432/secret_drop` |
| `MASTER_KEY` | Yes | 64-char hex string (32 bytes) for AES-256-GCM. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `PORT` | No | Server port (default: `3000`) |
| `FRONTEND_ORIGIN` | No | Allowed CORS origin (default: `http://localhost:5500`) |

---

## 7. API Reference

### `POST /api/secrets` — Create a secret

**Request body**
```json
{ "secret": "my-password", "ttl": 3600 }
```
| Field | Type | Description |
|-------|------|-------------|
| `secret` | string | Plaintext to store |
| `ttl` | number | Expiry in seconds from now (min 60, max 604800) |

**Response `201 Created`**
```json
{ "id": "<uuid>", "link": "http://…/web/index.html?id=<uuid>", "expiresAt": "…" }
```

---

### `GET /api/secrets/:id` — Retrieve and burn

**Response `200 OK`** — secret returned, permanently deleted from the database
```json
{ "secret": "my-password" }
```
**Response `404 Not Found`** — does not exist, already viewed, or expired

> **Note for candidate:** If your bot-protection strategy changes the method or path of this endpoint, update this section to reflect your actual implementation.

---

## 8. Challenge 1 — Race Condition Prevention

> **Requirement:** If two requests hit the same link at the exact same millisecond, only one must receive the secret. The other must get a 404.

### Strategy

_Write here — name the approach (e.g. atomic SQL UPDATE, pessimistic locking, Redis SETNX, etc.)_

### Implementation

_Write here — describe which file and function handles this, and why the chosen database operation is atomic._

```sql
-- Paste the key query here
```

### Why this works under concurrency

_Write here — explain the guarantee. What happens to the losing request?_

---

## 9. Challenge 2 — Crawler / Bot Protection

> **Requirement:** Automated crawlers (Slack previews, WhatsApp link cards, search bots) must not accidentally burn the secret by fetching the share URL.

### Strategy

_Write here — name the approach (e.g. POST-only burn endpoint, X-Requested-With header, two-step reveal, CAPTCHA, etc.)_

### Implementation

_Write here — describe the full request flow a human takes vs what a crawler sees. Reference the relevant files._

### Why bots cannot trigger the burn

_Write here — explain specifically what stops a bot, and whether your approach can be spoofed._

---

## 10. Challenge 3 — Resilient Cleanup

> **Requirement:** A secret must be inaccessible after `expires_at` even if the server was offline when it expired. Storage should eventually be reclaimed.

### Strategy

_Write here — describe the two layers: (a) how inaccessibility is enforced and (b) how physical deletion happens._

### Implementation

_Write here — where is `expires_at` checked on each request? Where does the cleanup job live? What happens on server restart?_

```sql
-- Paste the cleanup query here
```

### Why this survives server restarts

_Write here — explain why correctness does not depend on the server being continuously running._

---

## 11. Trade-offs & What I'd Do Differently

> Honest reflection. What shortcuts did you take? What would you improve with more time?

_Write here_
