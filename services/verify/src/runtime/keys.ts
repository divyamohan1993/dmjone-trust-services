/**
 * Public verification material for the verify composition root.
 *
 * The verify service is KEYLESS: it reads only the UNSEALED public material the
 * issuer published (ML-DSA public keys + the PAdES certificate). It never sees
 * the master key or any private key. If the issuer has not provisioned yet,
 * this throws and readiness stays red until it has.
 */

import type { SecretStore, VerifyingKeys } from '@dmjone/shared';
import { certFingerprint, mldsaPublicKeyId } from '@dmjone/crypto';

const NAME = {
  credPublic: 'cred_mldsa_public',
  padesCert: 'pades_cert_pem',
  logPublic: 'log_mldsa_public',
} as const;

const unb64 = (s: string): Uint8Array => new Uint8Array(Buffer.from(s, 'base64'));

export interface VerifyKeyMaterial {
  verifyingKeys: VerifyingKeys;
  /** The fingerprint verify pins uploaded-PDF PAdES signatures against. */
  padesFingerprint: string;
}

export async function loadVerifyingKeys(store: SecretStore): Promise<VerifyKeyMaterial> {
  const [credPublic, padesCertPem, logPublic] = await Promise.all([
    store.get(NAME.credPublic),
    store.get(NAME.padesCert),
    store.get(NAME.logPublic),
  ]);
  if (!credPublic || !padesCertPem || !logPublic) {
    throw new Error('public key material not provisioned yet — start the issuer service first');
  }
  const credPublicBytes = unb64(credPublic);
  return {
    verifyingKeys: {
      mldsaPublicKey: credPublicBytes,
      mldsaPublicKeyId: mldsaPublicKeyId(credPublicBytes),
      logMldsaPublicKey: unb64(logPublic),
      padesCertPem,
    },
    padesFingerprint: certFingerprint(padesCertPem),
  };
}
