import express      from 'express';
import rateLimit    from 'express-rate-limit';
import { v4 as uuid } from 'uuid';
import { encrypt, decrypt } from '../utils/crypto.js';

const router = express.Router();

const MAX_TTL_SECONDS  = 604800; // 7 days
const MAX_SECRET_BYTES = 10240;  // 10 KB

// ── Rate limiters ──────────────────────────────────────────────────────────
const createLimiter   = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
const retrieveLimiter = rateLimit({ windowMs:  5 * 60 * 1000, max: 15, standardHeaders: true, legacyHeaders: false });

// ── Helpers ────────────────────────────────────────────────────────────────
function validUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

// ── POST /api/secrets — Create ─────────────────────────────────────────────
router.post('/', createLimiter, async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { secret, ttl } = req.body;

    if (!secret || typeof secret !== 'string' || !secret.trim())
      return res.status(400).json({ error: 'secret is required.' });
    if (Buffer.byteLength(secret, 'utf8') > MAX_SECRET_BYTES)
      return res.status(413).json({ error: `Secret exceeds ${MAX_SECRET_BYTES} byte limit.` });

    const ttlSeconds    = Math.min(Math.max(parseInt(ttl, 10) || 3600, 60), MAX_TTL_SECONDS);
    const expiresAt     = new Date(Date.now() + ttlSeconds * 1000);
    const id            = uuid();
    const encryptedBody = encrypt(secret);

    await db.query(
      `INSERT INTO secrets (id, encrypted_body, expires_at) VALUES ($1, $2, $3)`,
      [id, encryptedBody, expiresAt],
    );

    const origin = process.env.FRONTEND_ORIGIN || 'http://localhost:5500';
    return res.status(201).json({
      id,
      link: `${origin}/web/index.html?id=${id}`,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (err) { next(err); }
});

// ── GET /api/secrets/:id — Retrieve & burn ─────────────────────────────────
router.get('/:id', retrieveLimiter, async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;

    if (!validUUID(id)) return res.status(404).json({ error: 'Secret not found.' });

    // ── CHALLENGE 1 — Bot Protection ──────────────────────────────────────
    // TODO: Crawlers and link-preview bots will hit this GET endpoint automatically
    // when someone pastes the share URL into Slack, WhatsApp, etc. — burning the
    // secret before the recipient ever sees it.
    // How will you ensure only a deliberate human action triggers the burn?

    // ── CHALLENGE 2 — Race Condition ──────────────────────────────────────
    // TODO: Two requests arriving at the same time could both read is_viewed = FALSE
    // and both return the secret. A SELECT followed by a separate UPDATE is not safe.
    // Your database operation must make the check and the burn atomic.
    //
    // const { rows } = await db.query(`...`, [id]);
    // if (rows.length === 0)
    //   return res.status(404).json({ error: 'Secret not found or already viewed.' });

    // TODO: decrypt rows[0].encrypted_body and return it
    // const plaintext = decrypt(rows[0].encrypted_body);
    // return res.status(200).json({ secret: plaintext });

    return res.status(200).json({ secret: 'TODO' });
  } catch (err) { next(err); }
});

export default router;
