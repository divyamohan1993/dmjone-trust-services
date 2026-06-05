/**
 * One-time admin recovery codes (last-resort, lockout-proof factor).
 *
 * Generated once at setup, shown ONCE, stored only as Argon2id hashes (via the
 * injected {@link PasswordHasher}, identical encoding to the candidate-password
 * path). A recovery code + TOTP lets the admin register a fresh passkey. Each
 * code is single-use: on a successful match its hash is removed from the
 * account so it cannot be replayed.
 */

import { randomBytes } from 'node:crypto';

import { RECOVERY_CODE_COUNT } from '@dmjone/shared';
import type { PasswordHasher } from '@dmjone/shared';

/** Crockford-ish base32 alphabet (no 0/1/O/I to avoid transcription errors). */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const GROUP = 5;
const GROUPS = 2; // 10 chars total per code → ~50 bits of entropy

/** Generate one human-friendly code like `K7P2Q-9MR4T`. */
export function generateRecoveryCode(): string {
  const out: string[] = [];
  for (let g = 0; g < GROUPS; g += 1) {
    const bytes = randomBytes(GROUP);
    let chunk = '';
    for (let i = 0; i < GROUP; i += 1) {
      chunk += ALPHABET[(bytes[i] as number) % ALPHABET.length];
    }
    out.push(chunk);
  }
  return out.join('-');
}

export interface GeneratedRecoveryCodes {
  /** Plaintext codes — surfaced to the admin exactly once, never stored. */
  plaintext: string[];
  /** Argon2id hashes — persisted on the AdminAccount. */
  hashes: string[];
}

/** Generate `RECOVERY_CODE_COUNT` codes and their Argon2id hashes. */
export async function generateRecoveryCodes(
  hasher: PasswordHasher,
  count: number = RECOVERY_CODE_COUNT,
): Promise<GeneratedRecoveryCodes> {
  const plaintext = Array.from({ length: count }, () => generateRecoveryCode());
  const hashes = await Promise.all(plaintext.map((code) => hasher.hash(normalizeCode(code))));
  return { plaintext, hashes };
}

/** Normalise user input: uppercase, strip spaces/dashes, so formatting is forgiving. */
export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, '');
}

/**
 * Try to consume a recovery code against the stored hashes. On the first match
 * returns the remaining hashes (with the used one removed); on no match returns
 * null. Checks every hash (no early-exit timing signal on which code matched).
 */
export async function consumeRecoveryCode(
  hasher: PasswordHasher,
  input: string,
  storedHashes: readonly string[],
): Promise<{ remaining: string[] } | null> {
  const candidate = normalizeCode(input);
  let matchedIndex = -1;
  for (let i = 0; i < storedHashes.length; i += 1) {
    const ok = await hasher.verify(candidate, storedHashes[i] as string);
    if (ok && matchedIndex === -1) matchedIndex = i;
  }
  if (matchedIndex === -1) return null;
  const remaining = storedHashes.filter((_, i) => i !== matchedIndex);
  return { remaining };
}
