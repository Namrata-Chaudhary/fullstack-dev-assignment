import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES  = 12;
const TAG_BYTES = 16;

function getKey() {
  const hex = process.env.MASTER_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('MASTER_KEY must be a 64-character hex string. Generate: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypts plaintext → base64url string safe to store in the DB.
 * @param {string} plaintext
 * @returns {string}
 */
export function encrypt(plaintext) {
  const iv     = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
}

/**
 * Decrypts a stored base64url payload → plaintext.
 * Throws if the payload was tampered with (auth tag mismatch).
 * @param {string} payload
 * @returns {string}
 */
export function decrypt(payload) {
  const buf        = Buffer.from(payload, 'base64url');
  const iv         = buf.subarray(0, IV_BYTES);
  const tag        = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = buf.subarray(IV_BYTES + TAG_BYTES);

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);

  return decipher.update(ciphertext) + decipher.final('utf8');
}
