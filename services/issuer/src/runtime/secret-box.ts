/**
 * AES-256-GCM authenticated encryption for secrets at rest.
 *
 * Used by the issuer composition root to seal the ML-DSA secret key, the log
 * secret key, and the PAdES private key before writing them to the SecretStore.
 * The master key comes from MASTER_ENCRYPTION_KEY (a Cloud Run secret); the
 * plaintext private keys never touch persistent storage unsealed.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALG = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

/** Seal bytes → base64(iv ‖ tag ‖ ciphertext). */
export function seal(masterKey: Uint8Array, plaintext: Uint8Array): string {
  if (masterKey.length !== KEY_LEN) throw new Error('master key must be 32 bytes');
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, masterKey, iv);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

/** Open a base64(iv ‖ tag ‖ ciphertext) blob. Throws on tamper or wrong key. */
export function open(masterKey: Uint8Array, sealed: string): Uint8Array {
  if (masterKey.length !== KEY_LEN) throw new Error('master key must be 32 bytes');
  const buf = Buffer.from(sealed, 'base64');
  if (buf.length < IV_LEN + TAG_LEN) throw new Error('sealed blob too short');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALG, masterKey, iv);
  decipher.setAuthTag(tag);
  return new Uint8Array(Buffer.concat([decipher.update(ct), decipher.final()]));
}

export function sealString(masterKey: Uint8Array, plaintext: string): string {
  return seal(masterKey, new Uint8Array(Buffer.from(plaintext, 'utf8')));
}

export function openString(masterKey: Uint8Array, sealed: string): string {
  return Buffer.from(open(masterKey, sealed)).toString('utf8');
}
