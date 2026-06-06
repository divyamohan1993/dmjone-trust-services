/**
 * Key provisioning for the issuer composition root.
 *
 * On first boot this generates the three keypairs that back the system (the
 * credential ML-DSA key, the self-signed PAdES X.509 key, and the transparency
 * log ML-DSA key) and persists them as exactly TWO Secret Manager secrets:
 *
 *   - `trust_public`  — plain JSON of all PUBLIC material (ML-DSA public keys +
 *     the PAdES certificate). The keyless verify service reads ONLY this; it
 *     never sees private ciphertext or the master key.
 *   - `trust_private` — JSON of the AES-256-GCM-sealed private halves. Read +
 *     unsealed only by the issuer.
 *
 * Two secrets instead of six keeps the project inside Secret Manager's free
 * tier and keeps the public/private split crisp.
 */

import type { SecretStore, SigningKeys, VerifyingKeys } from '@dmjone/shared';
import {
  certFingerprint,
  generateMldsaKeypair,
  generateSelfSignedPadesCert,
} from '@dmjone/crypto';
import { open, openString, seal, sealString } from './secret-box.js';

/** The two Secret Manager entries. */
export const TRUST_PUBLIC_SECRET = 'trust_public';
export const TRUST_PRIVATE_SECRET = 'trust_private'; // pragma: allowlist secret

/** Plain public material — what the keyless verify service consumes. */
interface PublicBlob {
  credPublic: string; // base64 ML-DSA public key
  credKid: string;
  padesCertPem: string;
  logPublic: string; // base64 ML-DSA log public key
}

/** Sealed private material — issuer-only. */
interface PrivateBlob {
  credSecretSealed: string;
  padesKeySealed: string;
  logSecretSealed: string;
}

export interface IssuerKeyMaterial {
  signingKeys: SigningKeys;
  logSecretKey: Uint8Array;
  verifyingKeys: VerifyingKeys;
  padesFingerprint: string;
}

const b64 = (b: Uint8Array): string => Buffer.from(b).toString('base64');
const unb64 = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, 'base64'));

/** Idempotent: load the key material, generating + persisting it on first run. */
export async function provisionIssuerKeys(
  store: SecretStore,
  masterKey: Uint8Array,
): Promise<IssuerKeyMaterial> {
  if (await store.get(TRUST_PRIVATE_SECRET)) return loadIssuerKeys(store, masterKey);

  const cred = generateMldsaKeypair();
  const pades = generateSelfSignedPadesCert();
  const log = generateMldsaKeypair();

  const pub: PublicBlob = {
    credPublic: b64(cred.publicKey),
    credKid: cred.publicKeyId,
    padesCertPem: pades.certPem,
    logPublic: b64(log.publicKey),
  };
  const priv: PrivateBlob = {
    credSecretSealed: seal(masterKey, cred.secretKey),
    padesKeySealed: sealString(masterKey, pades.keyPem),
    logSecretSealed: seal(masterKey, log.secretKey),
  };
  await store.set(TRUST_PUBLIC_SECRET, JSON.stringify(pub));
  await store.set(TRUST_PRIVATE_SECRET, JSON.stringify(priv));

  return assemble(pub, priv, masterKey);
}

async function loadIssuerKeys(store: SecretStore, masterKey: Uint8Array): Promise<IssuerKeyMaterial> {
  const [pubRaw, privRaw] = await Promise.all([
    store.get(TRUST_PUBLIC_SECRET),
    store.get(TRUST_PRIVATE_SECRET),
  ]);
  if (!pubRaw || !privRaw) {
    throw new Error('key material incomplete in SecretStore; re-provision required');
  }
  return assemble(JSON.parse(pubRaw) as PublicBlob, JSON.parse(privRaw) as PrivateBlob, masterKey);
}

function assemble(pub: PublicBlob, priv: PrivateBlob, masterKey: Uint8Array): IssuerKeyMaterial {
  const credPublic = unb64(pub.credPublic);
  const signingKeys: SigningKeys = {
    padesCertPem: pub.padesCertPem,
    padesKeyPem: openString(masterKey, priv.padesKeySealed),
    mldsaPublicKey: credPublic,
    mldsaSecretKey: open(masterKey, priv.credSecretSealed),
    mldsaPublicKeyId: pub.credKid,
  };
  const verifyingKeys: VerifyingKeys = {
    mldsaPublicKey: credPublic,
    mldsaPublicKeyId: pub.credKid,
    logMldsaPublicKey: unb64(pub.logPublic),
    padesCertPem: pub.padesCertPem,
  };
  return {
    signingKeys,
    logSecretKey: open(masterKey, priv.logSecretSealed),
    verifyingKeys,
    padesFingerprint: certFingerprint(pub.padesCertPem),
  };
}
