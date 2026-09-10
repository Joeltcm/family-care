import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { config } from '../config.js';

function key() {
  if (!config.FIELD_ENCRYPTION_KEY) throw new Error('field_encryption_not_configured');
  return createHash('sha256').update(config.FIELD_ENCRYPTION_KEY).digest();
}

export function encryptField(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join(':');
}

export function decryptField(value: string | null) {
  if (!value) return null;
  const [version, iv, tag, encrypted] = value.split(':');
  if (version !== 'v1' || !iv || !tag || !encrypted) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export function maskedField(value: string | null) {
  const plain = decryptField(value);
  if (!plain) return null;
  const compact = plain.replace(/\s+/g, '');
  return `•••• ${compact.slice(-4)}`;
}
