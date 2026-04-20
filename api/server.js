import 'dotenv/config';
import express   from 'express';
import helmet    from 'helmet';
import cors      from 'cors';
import rateLimit from 'express-rate-limit';
import pg        from 'pg';
import secretsRouter from './routes/secrets.js';

const { Pool } = pg;
const app  = express();
const PORT = process.env.PORT || 3000;

// ── Startup validation ─────────────────────────────────────────────────────
if (!process.env.MASTER_KEY || process.env.MASTER_KEY.length !== 64) {
  console.error('ERROR: MASTER_KEY must be a 64-character hex string.');
  console.error('Generate: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set.');
  process.exit(1);
}

// ── Security middleware ────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5500', methods: ['GET', 'POST'] }));
app.use(express.json({ limit: '16kb' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false }));

// ── Database pool ──────────────────────────────────────────────────────────
const db = new Pool({ connectionString: process.env.DATABASE_URL });
app.locals.db = db;

// ── Routes ─────────────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok' }));
app.use('/api/secrets', secretsRouter);

// ── 404 & error handlers ───────────────────────────────────────────────────
app.use((_, res) => res.status(404).json({ error: 'Not found.' }));
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error.' });
});

// ── Resilient cleanup job ──────────────────────────────────────────────────
async function cleanupExpired() {
  try {
    // ── CHALLENGE 3 — Resilient Cleanup ─────────────────────────────────
    // TODO: Delete secrets that have passed their expires_at deadline.
    // This job runs on startup and every 10 minutes so storage is reclaimed
    // even for secrets that were never viewed.
    // Consider: if the server was down for hours, what happens to secrets
    // that expired during that window? Are they still accessible?
  } catch (err) {
    console.error('Cleanup error:', err.message);
  }
}

cleanupExpired();
setInterval(cleanupExpired, 10 * 60 * 1000);

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
