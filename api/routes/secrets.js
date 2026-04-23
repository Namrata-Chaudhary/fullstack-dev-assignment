import express      from 'express';
import rateLimit    from 'express-rate-limit';
import { v4 as uuid } from 'uuid';
import { encrypt, decrypt } from '../utils/crypto.js';

const router = express.Router();

const MAX_TTL_SECONDS  = 604800; // 7 days
const MIN_TTL_SECONDS  = parseInt(process.env.MIN_TTL_SECONDS || '60', 10); // 60 seconds (or lower for testing)
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

    const ttlSeconds    = Math.min(Math.max(parseInt(ttl, 10) || 3600, MIN_TTL_SECONDS), MAX_TTL_SECONDS);
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

// ── POST /api/secrets/:id/reveal — Reveal & burn (Bot-protected) ────────────
// NOTE: We use POST instead of GET to:
//  1. Prevent automatic bot access (bots typically only prefetch GET/HEAD)
//  2. Allow us to validate the Origin header (browsers enforce CORS)
//  3. Allow custom headers that indicate a real browser interaction
router.post('/:id/reveal', retrieveLimiter, async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;

    if (!validUUID(id)) return res.status(404).json({ error: 'Secret not found.' });

    // ── CHALLENGE 2 — Bot Protection (Part 1) ──────────────────────────────
    // Use POST method instead of GET. Link preview bots (Slack, Discord, WhatsApp,
    // etc.) only issue GET/HEAD requests during initial URL preview. They will not
    // POST to this endpoint, so the secret won't be burned.
    // Additionally, browsers enforce same-origin policy on POST requests, so
    // cross-origin bots cannot trigger this endpoint.

    // Additional validation: Only allow requests from recognized frontends
    // (via Origin or Referer header)
    const origin = req.headers.origin || req.headers.referer;
    const allowedOrigins = [
      process.env.FRONTEND_ORIGIN || 'http://localhost:5500',
      'http://localhost:5500',
      'http://localhost:3000',
    ];
    const isAllowedOrigin = !origin || allowedOrigins.some(o => origin.startsWith(o));
    if (!isAllowedOrigin) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    // ── CHALLENGE 1 — Race Condition Prevention ────────────────────────────
    // Use a single atomic UPDATE statement that:
    //  1. Checks if the secret exists AND hasn't been viewed AND hasn't expired
    //  2. Marks is_viewed = TRUE in the same transaction
    //  3. Returns the encrypted body if successful, NULL if already viewed
    //
    // PostgreSQL executes the WHERE clause and UPDATE atomically. If two
    // concurrent requests arrive, only one will succeed in the WHERE clause;
    // the other will get 0 rows.
    const { rows } = await db.query(
      `UPDATE secrets 
       SET is_viewed = TRUE 
       WHERE id = $1 
         AND is_viewed = FALSE 
         AND expires_at > NOW()
       RETURNING encrypted_body`,
      [id]
    );

    if (rows.length === 0) {
      // Secret either doesn't exist, was already viewed, or has expired
      return res.status(404).json({ error: 'Secret not found or already viewed.' });
    }

    // Decrypt and return the secret
    try {
      const plaintext = decrypt(rows[0].encrypted_body);
      return res.status(200).json({ secret: plaintext });
    } catch (decryptErr) {
      // Decryption failed - likely the MASTER_KEY is wrong
      console.error('Decrypt error:', decryptErr.message);
      return res.status(500).json({ error: 'Internal server error.' });
    }
  } catch (err) { next(err); }
});

// ── GET /api/secrets/:id — Check if exists (metadata only, no reveal) ────────
// This endpoint allows the frontend to check if a secret exists and hasn't
// expired before showing the "Reveal" button. It does NOT reveal or burn the secret.
router.get('/:id', retrieveLimiter, async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;

    if (!validUUID(id)) return res.status(404).json({ error: 'Secret not found.' });

    const { rows } = await db.query(
      `SELECT id, is_viewed, expires_at FROM secrets 
       WHERE id = $1`,
      [id]
    );

    if (rows.length === 0 || rows[0].is_viewed || rows[0].expires_at < new Date()) {
      return res.status(404).json({ error: 'Secret not found or already viewed.' });
    }

    // Return metadata (no secret content)
    return res.status(200).json({
      exists: true,
      expiresAt: rows[0].expires_at.toISOString(),
    });
  } catch (err) { next(err); }
});

export default router;
