/**
 * Key provisioning for the issuer composition root.
 *
 * On first boot this generates the three keypairs that back the system (the
 * credential ML-DSA key, the self-signed PAdES X.509 key, and the transparency
 * log ML-DSA key), seals the secret halves with the master key, and persists
 * them via the SecretStore. On every subsequent boot it loads + unseals them.
 *
 * Public material (ML-DSA public keys, the PAdES certificate) is stored
 * UNSEALED so the keyless verify service can read it without ever touching the
 * master key or a private key.
 */

import type { SecretStore, SigningKeys, VerifyingKeys } from '@dmjone/shared';
import {
  certFingerprint,
  generateMldsaKeypair,
  generateSelfSignedPadesCert,
  mldsaPublicKeyId,
} from '@dmjone/crypto';
import { openString, sealString, seal, open } from './secret-box.js';

/** SecretStore key names. `*_secret` are sealed; the rest are plain. */
// NB: the `*_secret` strings below are Secret Manager key NAMES (identifiers),
// not credential values — the actual secrets are sealed at runtime.
const NAME = {
  credSecret: 'cred_mldsa_secret', // pragma: allowlist secret
  credPublic: 'cred_mldsa_public',
  padesCert: 'pades_cert_pem',
  padesKey: 'pades_key_pem_secret', // pragma: allowlist secret
  logSecret: 'log_mldsa_secret', // pragma: allowlist secret
  logPublic: 'log_mldsa_public',
} as const;

export interface IssuerKeyMaterial {
  signingKeys: SigningKeys;
  /** The transparency-log secret key (for createLogSigner). */
  logSecretKey: Uint8Array;
  /** Public material, also handed to the verify service. */
  verifyingKeys: VerifyingKeys;
  /** SHA-256 of the PAdES cert DER — the trusted fingerprint verify pins against. */
  padesFingerprint: string;
}

const b64 = (b: Uint8Array): string => Buffer.from(b).toString('base64');
const unb64 = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, 'base64'));

/**
 * Idempotent: load the key material, generating + persisting it on first run.
 * Concurrency note: two cold issuer instances booting simultaneously could both
 * generate; v1 runs `max-instances` low and the SecretStore set is last-writer.
 * If that ever matters, wrap generation in a Firestore-locked critical section.
 */
export async function provisionIssuerKeys(
  store: SecretStore,
  masterKey: Uint8Array,
): Promise<IssuerKeyMaterial> {
  const credSecretSealed = await store.get(NAME.credSecret);
  if (credSecretSealed) return loadIssuerKeys(store, masterKey);

  const cred = generateMldsaKeypair();
  const pades = generateSelfSignedPadesCert();
  const log = generateMldsaKeypair();

  await store.set(NAME.credSecret, seal(masterKey, cred.secretKey));
  await store.set(NAME.credPublic, b64(cred.publicKey));
  await store.set(NAME.padesCert, pades.certPem);
  await store.set(NAME.padesKey, sealString(masterKey, pades.keyPem));
  await store.set(NAME.logSecret, seal(masterKey, log.secretKey));
  await store.set(NAME.logPublic, b64(log.publicKey));

  return assemble({
    credPublic: cred.publicKey,
    credSecret: cred.secretKey,
    credKid: cred.publicKeyId,
    padesCertPem: pades.certPem,
    padesKeyPem: pades.keyPem,
    padesFingerprint: pades.fingerprint,
    logPublic: log.publicKey,
    logSecret: log.secretKey,
  });
}

async function loadIssuerKeys(store: SecretStore, masterKey: Uint8Array): Promise<IssuerKeyMaterial> {
  const [credSecret, credPublic, padesCertPem, padesKeySealed, logSecret, logPublic] =
    await Promise.all([
      store.get(NAME.credSecret),
      store.get(NAME.credPublic),
      store.get(NAME.padesCert),
      store.get(NAME.padesKey),
      store.get(NAME.logSecret),
      store.get(NAME.logPublic),
    ]);
  if (!credSecret || !credPublic || !padesCertPem || !padesKeySealed || !logSecret || !logPublic) {
    throw new Error('key material incomplete in SecretStore; re-provision required');
  }
  const credPublicBytes = unb64(credPublic);
  return assemble({
    credPublic: credPublicBytes,
    credSecret: open(masterKey, credSecret),
    credKid: mldsaPublicKeyId(credPublicBytes),
    padesCertPem,
    padesKeyPem: openString(masterKey, padesKeySealed),
    padesFingerprint: certFingerprint(padesCertPem),
    logPublic: unb64(logPublic),
    logSecret: open(masterKey, logSecret),
  });
}

function assemble(m: {
  credPublic: Uint8Array;
  credSecret: Uint8Array;
  credKid: string;
  padesCertPem: string;
  padesKeyPem: string;
  padesFingerprint: string;
  logPublic: Uint8Array;
  logSecret: Uint8Array;
}): IssuerKeyMaterial {
  const signingKeys: SigningKeys = {
    padesCertPem: m.padesCertPem,
    padesKeyPem: m.padesKeyPem,
    mldsaPublicKey: m.credPublic,
    mldsaSecretKey: m.credSecret,
    mldsaPublicKeyId: m.credKid,
  };
  const verifyingKeys: VerifyingKeys = {
    mldsaPublicKey: m.credPublic,
    mldsaPublicKeyId: m.credKid,
    logMldsaPublicKey: m.logPublic,
    padesCertPem: m.padesCertPem,
  };
  return {
    signingKeys,
    logSecretKey: m.logSecret,
    verifyingKeys,
    padesFingerprint: m.padesFingerprint,
  };
}
