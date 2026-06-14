/**
 * Signed status assertions — provable, dated revocation evidence.
 *
 * A status assertion is a detached ML-DSA-87 signature over the domain-separated
 * status payload (see {@link computeStatusAssertionPayload}): it lets a relying
 * party prove "the issuer asserted credential X had status S as of time T",
 * which an unsigned `status` flag cannot. The issuer signs it with the SAME
 * ML-DSA-87 key it uses for credentials; the {@link STATUS_ASSERTION_DOMAIN} tag
 * in the signed bytes makes that key reuse safe (a status signature can never be
 * a valid credential signature, or vice-versa, by construction).
 *
 * The *Signer holds secret material → issuer-only. The *Verifier is public-key
 * only → safe in the keyless verify service AND reproducible by any relying
 * party (it only needs the issuer's public key + the three bound fields).
 */

import { ml_dsa87 } from '@noble/post-quantum/ml-dsa.js';
import { computeStatusAssertionPayload, type StatusAssertionInput } from '@dmjone/shared';
import { base64ToBytes, bytesToBase64, toUtf8Bytes } from './hash.js';

/** Issuer-side: signs a status assertion. Holds the ML-DSA-87 secret key. */
export interface StatusSigner {
  /** ML-DSA-87 signature over the domain-tagged status payload, base64. */
  sign(input: StatusAssertionInput): string;
}

/** Verify-side / relying-party: checks a status assertion. Public key only. */
export interface StatusVerifier {
  verify(input: StatusAssertionInput, signatureB64: string): boolean;
}

export function createStatusSigner(mldsaSecretKey: Uint8Array): StatusSigner {
  return {
    sign(input: StatusAssertionInput): string {
      return bytesToBase64(ml_dsa87.sign(toUtf8Bytes(computeStatusAssertionPayload(input)), mldsaSecretKey));
    },
  };
}

export function createStatusVerifier(mldsaPublicKey: Uint8Array): StatusVerifier {
  return {
    verify(input: StatusAssertionInput, signatureB64: string): boolean {
      try {
        return ml_dsa87.verify(
          base64ToBytes(signatureB64),
          toUtf8Bytes(computeStatusAssertionPayload(input)),
          mldsaPublicKey,
        );
      } catch {
        // Malformed signature / inputs → not verified. Never throws.
        return false;
      }
    },
  };
}
