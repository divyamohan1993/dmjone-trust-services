/**
 * TOTP step-up factor (RFC 6238), enrolled in Microsoft Authenticator.
 *
 * Enrollment generates a fresh secret, returns the `otpauth://` provisioning
 * URI (+ base32 for manual entry) for the authenticator app, and the AES-GCM
 * ciphertext of the secret to persist on the AdminAccount. Verification decrypts
 * the stored secret and checks a 6-digit code within a small window (±1 step)
 * to tolerate clock skew without widening the brute-force surface.
 */

import { Secret, TOTP } from 'otpauth';

import type { AppEnv } from '@dmjone/shared';

import type { SecretSealer } from '../deps.js';

const DIGITS = 6;
const PERIOD = 30;
const ALGORITHM = 'SHA1'; // Authenticator-app default; required for compatibility.
/** Accept the current step ±1 (≈90s total) for clock skew. */
const VERIFY_WINDOW = 1;

export interface TotpEnrollment {
  /** Scan-or-paste provisioning URI for the authenticator app. */
  otpauthUri: string;
  /** Base32 secret for manual entry (when a QR cannot be scanned). */
  base32Secret: string;
  /** AES-GCM ciphertext of the secret, to store on the AdminAccount. */
  encryptedSecret: string;
}

function buildTotp(env: AppEnv, secret: Secret): TOTP {
  return new TOTP({
    issuer: env.TRUST_SERVICE_NAME,
    label: env.ISSUER_CONTACT_EMAIL,
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD,
    secret,
  });
}

/** Generate a new TOTP secret + provisioning material. Seals the secret at rest. */
export function enrollTotp(env: AppEnv, sealer: SecretSealer): TotpEnrollment {
  const secret = new Secret({ size: 20 }); // 160-bit, RFC-recommended
  const totp = buildTotp(env, secret);
  return {
    otpauthUri: totp.toString(),
    base32Secret: secret.base32,
    encryptedSecret: sealer.sealString(secret.base32),
  };
}

/**
 * Verify a 6-digit code against the stored (sealed) secret.
 * Returns false for malformed codes or any mismatch; never throws on bad input.
 */
export function verifyTotp(env: AppEnv, sealer: SecretSealer, encryptedSecret: string, token: string): boolean {
  const cleaned = token.replace(/\s/g, '');
  if (!/^\d{6}$/.test(cleaned)) return false;
  const base32 = sealer.openString(encryptedSecret);
  const totp = buildTotp(env, Secret.fromBase32(base32));
  const delta = totp.validate({ token: cleaned, window: VERIFY_WINDOW });
  return delta !== null;
}
