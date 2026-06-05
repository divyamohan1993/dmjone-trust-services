/**
 * Composition-root bootstrap helpers for the issuer (orchestrator-owned).
 *
 * Resolves the master encryption key and builds the SecretSealer that the auth
 * layer uses to encrypt the TOTP secret. There is exactly ONE sealing
 * implementation (secret-box.ts), shared between key provisioning and the
 * injected SecretSealer, so the encoding never drifts.
 */

import { randomBytes } from 'node:crypto';
import type { AppEnv } from '@dmjone/shared';
import type { SecretSealer } from '../deps.js';
import { openString, sealString } from './secret-box.js';

const KEY_LEN = 32;

/**
 * Resolve the 32-byte master key.
 *  - Set (base64, 32 bytes): use it.
 *  - Unset in production: throw (we must not run with an unstable key).
 *  - Unset in dev/test: generate an ephemeral key + warn (sealed secrets won't
 *    survive a restart, which is fine for local development).
 */
export function resolveMasterKey(env: AppEnv, warn: (msg: string) => void): Uint8Array {
  const raw = env.MASTER_ENCRYPTION_KEY?.trim();
  if (raw) {
    const key = new Uint8Array(Buffer.from(raw, 'base64'));
    if (key.length !== KEY_LEN) {
      throw new Error('MASTER_ENCRYPTION_KEY must be base64-encoded 32 bytes');
    }
    return key;
  }
  if (env.NODE_ENV === 'production') {
    throw new Error('MASTER_ENCRYPTION_KEY is required in production');
  }
  warn(
    'MASTER_ENCRYPTION_KEY not set — generating an EPHEMERAL dev key; sealed secrets will not survive a restart',
  );
  return new Uint8Array(randomBytes(KEY_LEN));
}

export function buildSecretSealer(masterKey: Uint8Array): SecretSealer {
  return {
    sealString: (plaintext) => sealString(masterKey, plaintext),
    openString: (sealed) => openString(masterKey, sealed),
  };
}
