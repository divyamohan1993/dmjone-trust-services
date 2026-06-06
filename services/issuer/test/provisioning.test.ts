/**
 * Exercises the orchestrator-owned composition glue that the 237 unit tests
 * never touch: AES-256-GCM secret sealing, master-key resolution, and the
 * generate-then-reload key provisioning — against an in-memory SecretStore.
 */

import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createInMemoryStores } from '@dmjone/data';
import { certFingerprint } from '@dmjone/crypto';
import type { AppEnv } from '@dmjone/shared';
import { open, openString, seal, sealString } from '../src/runtime/secret-box.js';
import { buildSecretSealer, resolveMasterKey } from '../src/runtime/bootstrap.js';
import { provisionIssuerKeys } from '../src/runtime/keys.js';

const masterKey = () => new Uint8Array(randomBytes(32));

describe('secret-box (AES-256-GCM)', () => {
  it('seals and opens bytes; rejects tamper', () => {
    const k = masterKey();
    const pt = new Uint8Array([1, 2, 3, 4, 5]);
    const sealed = seal(k, pt);
    expect(Buffer.from(open(k, sealed)).equals(Buffer.from(pt))).toBe(true);

    // Flip a byte of the ciphertext → auth tag fails.
    const buf = Buffer.from(sealed, 'base64');
    buf[buf.length - 1] ^= 0x01;
    expect(() => open(k, buf.toString('base64'))).toThrow();

    // Wrong key → fails.
    expect(() => open(masterKey(), sealed)).toThrow();
  });

  it('seals and opens strings (PEM / TOTP secret)', () => {
    const k = masterKey();
    const s = '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----'; // pragma: allowlist secret
    expect(openString(k, sealString(k, s))).toBe(s);
  });

  it('buildSecretSealer round-trips (the injected TOTP sealer)', () => {
    const sealer = buildSecretSealer(masterKey());
    expect(sealer.openString(sealer.sealString('totp-secret'))).toBe('totp-secret');
  });
});

describe('resolveMasterKey', () => {
  const base = { NODE_ENV: 'production', MASTER_ENCRYPTION_KEY: undefined } as unknown as AppEnv;
  it('throws in production when unset', () => {
    expect(() => resolveMasterKey(base, () => {})).toThrow();
  });
  it('accepts a valid base64 32-byte key', () => {
    const env = { ...base, MASTER_ENCRYPTION_KEY: Buffer.from(randomBytes(32)).toString('base64') };
    expect(resolveMasterKey(env, () => {}).length).toBe(32);
  });
  it('rejects a wrong-length key', () => {
    const env = { ...base, MASTER_ENCRYPTION_KEY: Buffer.from(randomBytes(16)).toString('base64') };
    expect(() => resolveMasterKey(env, () => {})).toThrow();
  });
});

describe('provisionIssuerKeys', () => {
  it('generates on first run and reloads identical material on the second', async () => {
    const store = createInMemoryStores().secrets;
    const mk = masterKey();

    const first = await provisionIssuerKeys(store, mk);
    const second = await provisionIssuerKeys(store, mk);

    // Private material survives the seal → store → unseal round-trip byte-for-byte.
    expect(Buffer.from(second.signingKeys.mldsaSecretKey).equals(Buffer.from(first.signingKeys.mldsaSecretKey))).toBe(true);
    expect(Buffer.from(second.logSecretKey).equals(Buffer.from(first.logSecretKey))).toBe(true);
    expect(second.signingKeys.padesKeyPem).toBe(first.signingKeys.padesKeyPem);

    // Public material + fingerprint are stable and self-consistent.
    expect(second.signingKeys.padesCertPem).toBe(first.signingKeys.padesCertPem);
    expect(second.padesFingerprint).toBe(first.padesFingerprint);
    expect(certFingerprint(first.verifyingKeys.padesCertPem)).toBe(first.padesFingerprint);
    expect(Buffer.from(first.verifyingKeys.mldsaPublicKey).equals(Buffer.from(first.signingKeys.mldsaPublicKey))).toBe(true);
  });

  it('seals private keys at rest (the stored secret is not the raw key)', async () => {
    const store = createInMemoryStores().secrets;
    const mk = masterKey();
    const km = await provisionIssuerKeys(store, mk);

    const privRaw = await store.get('trust_private');
    const pubRaw = await store.get('trust_public');
    expect(privRaw).toBeTruthy();
    expect(pubRaw).toBeTruthy();

    // The private blob holds only SEALED material — neither the raw ML-DSA key
    // nor the plain PAdES private key may appear in it.
    const rawSecretB64 = Buffer.from(km.signingKeys.mldsaSecretKey).toString('base64');
    expect(privRaw).not.toContain(rawSecretB64);
    expect(privRaw).not.toContain(km.signingKeys.padesKeyPem);
    const priv = JSON.parse(privRaw!) as { credSecretSealed: string };
    expect(Buffer.from(open(mk, priv.credSecretSealed)).equals(Buffer.from(km.signingKeys.mldsaSecretKey))).toBe(true);

    // The public blob holds PLAIN material the keyless verifier reads directly.
    const pub = JSON.parse(pubRaw!) as { credPublic: string };
    expect(pub.credPublic).toBe(Buffer.from(km.signingKeys.mldsaPublicKey).toString('base64'));
  });
});
