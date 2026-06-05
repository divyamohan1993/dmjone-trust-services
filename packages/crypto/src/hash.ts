/**
 * Hashing and byte-encoding primitives shared across the crypto package.
 *
 * SHA-256 is the one content + chain hash for the whole system (per ALGO.HASH).
 * Everything that needs a hex digest funnels through {@link sha256Hex} so the
 * encoding (lowercase hex, no separators) is identical on the sign and verify
 * sides — a divergence here would silently break tamper detection.
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

/** Lowercase hex SHA-256 of the input. Strings are encoded as UTF-8 first. */
export function sha256Hex(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? utf8ToBytes(input) : input;
  return bytesToHex(sha256(bytes));
}

/** UTF-8 encode a string to bytes (re-exported so callers need one import). */
export function toUtf8Bytes(value: string): Uint8Array {
  return utf8ToBytes(value);
}

/** Standard base64 (not URL-safe) encode of raw bytes. */
export function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

/** Decode standard base64 to raw bytes. */
export function base64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}
