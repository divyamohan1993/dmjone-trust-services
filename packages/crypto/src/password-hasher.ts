/**
 * Argon2id password hashing for the candidate download password.
 *
 * Implements the shared {@link PasswordHasher} contract. The SAME injected
 * instance is used by the issuer (hash at issue-time) and the verify service
 * (check at download-time), and {@link hash} emits a self-describing PHC string
 * with the cost parameters + salt embedded, so {@link verify} re-derives with
 * exactly the parameters the hash was produced under — encoding can never drift
 * between the two services.
 *
 * The KDF itself is @noble/hashes' vetted Argon2id (RFC 9106); only the standard
 * PHC envelope (parse/format) is implemented here — no custom cryptography. The
 * async variant is used so a server hashing a password never blocks the event
 * loop. Comparison is constant-time via node:crypto `timingSafeEqual`.
 */

import { argon2idAsync } from '@noble/hashes/argon2.js';
import { randomBytes } from '@noble/hashes/utils.js';
import { timingSafeEqual } from 'node:crypto';
import type { PasswordHasher } from '@dmjone/shared';
import { base64ToBytes, bytesToBase64, toUtf8Bytes } from './hash.js';

/** Argon2 version 0x13 (19) — the only version @noble/hashes emits/accepts. */
const ARGON2_VERSION = 0x13;
/** Derived-key length in bytes. */
const DK_LEN = 32;
/** Salt length in bytes (16 is the PHC/RFC 9106 recommendation). */
const SALT_LEN = 16;

/**
 * Argon2id cost parameters. Required by design — the composition root passes
 * concrete values (from env / {@link ARGON2_DEFAULTS}) so the cost is always an
 * explicit, auditable choice rather than a hidden default. See ARGON2_DEFAULTS
 * for the tuned pure-JS profile.
 */
export interface PasswordHasherParams {
  /** Memory cost in KiB. */
  memoryKiB: number;
  /** Time cost (iterations). */
  iterations: number;
  /** Parallelism (1 for @noble's single-threaded Argon2id). */
  parallelism: number;
}

interface PhcParts {
  memoryKiB: number;
  iterations: number;
  parallelism: number;
  salt: Uint8Array;
  hash: Uint8Array;
}

/**
 * Build an Argon2id {@link PasswordHasher}. The cost parameters apply to NEWLY
 * created hashes; verification always uses the parameters embedded in the stored
 * PHC string, so old hashes keep verifying after a cost change. The SAME params
 * are passed to the issuer and verify composition roots; encoding lines up by
 * construction because `verify` re-derives from the stored string's params.
 */
export function createPasswordHasher(params: PasswordHasherParams): PasswordHasher {
  const { memoryKiB, iterations, parallelism } = params;

  return {
    async hash(password: string): Promise<string> {
      const salt = randomBytes(SALT_LEN);
      const derived = await argon2idAsync(toUtf8Bytes(password), salt, {
        t: iterations,
        m: memoryKiB,
        p: parallelism,
        dkLen: DK_LEN,
      });
      return formatPhc({
        memoryKiB,
        iterations,
        parallelism,
        salt,
        hash: Uint8Array.from(derived),
      });
    },

    async verify(password: string, stored: string): Promise<boolean> {
      let parts: PhcParts | null;
      try {
        parts = parsePhc(stored);
      } catch {
        return false;
      }
      if (!parts) return false;

      try {
        const derived = await argon2idAsync(toUtf8Bytes(password), parts.salt, {
          t: parts.iterations,
          m: parts.memoryKiB,
          p: parts.parallelism,
          dkLen: parts.hash.length,
        });
        return constantTimeEqual(Uint8Array.from(derived), parts.hash);
      } catch {
        return false;
      }
    },
  };
}

/** Encode the PHC string: `$argon2id$v=19$m=<>,t=<>,p=<>$<saltB64>$<hashB64>`. */
function formatPhc(parts: PhcParts): string {
  const params = `m=${parts.memoryKiB},t=${parts.iterations},p=${parts.parallelism}`;
  return `$argon2id$v=${ARGON2_VERSION}$${params}$${b64NoPad(parts.salt)}$${b64NoPad(parts.hash)}`;
}

/** Parse a PHC argon2id string. Returns null when it is not our format. */
function parsePhc(stored: string): PhcParts | null {
  // ['', 'argon2id', 'v=19', 'm=..,t=..,p=..', saltB64, hashB64]
  const segs = stored.split('$');
  if (segs.length !== 6) return null;
  if (segs[0] !== '') return null;
  if (segs[1] !== 'argon2id') return null;

  const version = parseIntField(segs[2], 'v');
  if (version !== ARGON2_VERSION) return null;

  const paramSegment = segs[3];
  if (paramSegment === undefined) return null;
  const params = paramSegment.split(',');
  if (params.length !== 3) return null;
  const memoryKiB = parseIntField(params[0], 'm');
  const iterations = parseIntField(params[1], 't');
  const parallelism = parseIntField(params[2], 'p');
  if (memoryKiB === null || iterations === null || parallelism === null) return null;

  const saltB64 = segs[4];
  const hashB64 = segs[5];
  if (!saltB64 || !hashB64) return null;

  const salt = base64ToBytes(padB64(saltB64));
  const hash = base64ToBytes(padB64(hashB64));
  if (salt.length === 0 || hash.length === 0) return null;

  return { memoryKiB, iterations, parallelism, salt, hash };
}

/** Parse a `key=intValue` PHC field; null if the key or integer is wrong. */
function parseIntField(field: string | undefined, key: string): number | null {
  if (field === undefined) return null;
  const prefix = `${key}=`;
  if (!field.startsWith(prefix)) return null;
  const raw = field.slice(prefix.length);
  if (!/^\d+$/.test(raw)) return null;
  return Number(raw);
}

/** Standard base64 with the `=` padding stripped (PHC convention). */
function b64NoPad(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/=+$/, '');
}

/** Restore base64 `=` padding so the decoder accepts it. */
function padB64(b64: string): string {
  const remainder = b64.length % 4;
  return remainder === 0 ? b64 : b64 + '='.repeat(4 - remainder);
}

/** Length-checked constant-time comparison (node:crypto timingSafeEqual). */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
