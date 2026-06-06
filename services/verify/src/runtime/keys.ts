/**
 * Public verification material for the verify composition root.
 *
 * The verify service is KEYLESS: it reads ONLY the `trust_public` secret (plain
 * JSON of the ML-DSA public keys + the PAdES certificate the issuer published).
 * It never reads `trust_private`, the master key, or any sealed ciphertext. If
 * the issuer has not provisioned yet, this throws and readiness stays red.
 */

import type { SecretStore, VerifyingKeys } from '@dmjone/shared';
import { certFingerprint, mldsaPublicKeyId } from '@dmjone/crypto';

const TRUST_PUBLIC_SECRET = 'trust_public';

interface PublicBlob {
  credPublic: string;
  credKid: string;
  padesCertPem: string;
  logPublic: string;
}

const unb64 = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, 'base64'));

export interface VerifyKeyMaterial {
  verifyingKeys: VerifyingKeys;
  /** The fingerprint verify pins uploaded-PDF PAdES signatures against. */
  padesFingerprint: string;
}

export async function loadVerifyingKeys(store: SecretStore): Promise<VerifyKeyMaterial> {
  const raw = await store.get(TRUST_PUBLIC_SECRET);
  if (!raw) {
    throw new Error('public key material not provisioned yet — start the issuer service first');
  }
  const pub = JSON.parse(raw) as PublicBlob;
  const credPublic = unb64(pub.credPublic);
  return {
    verifyingKeys: {
      mldsaPublicKey: credPublic,
      // Recompute the id from the key (cheaper than trusting the stored one).
      mldsaPublicKeyId: pub.credKid || mldsaPublicKeyId(credPublic),
      logMldsaPublicKey: unb64(pub.logPublic),
      padesCertPem: pub.padesCertPem,
    },
    padesFingerprint: certFingerprint(pub.padesCertPem),
  };
}
