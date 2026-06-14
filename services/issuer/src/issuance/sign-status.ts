/**
 * Mint a signed status assertion for a credential.
 *
 * One place so the three issuance pipelines (certificate / letter / upload) and
 * the revoke route produce the assertion identically. The result is stored on
 * the record as {@link CredentialRecord.statusSignature}; the keyless verify
 * service serves it verbatim and never signs.
 */

import type { CredentialStatus } from '@dmjone/shared';
import type { StatusSigner } from '@dmjone/crypto';

/**
 * @param asOf the instant the status took effect — `createdAt` at issue,
 *   `revokedAt` on revoke. NEVER the signing wall-clock (the signed bytes must
 *   be reproducible by a verifier).
 */
export function mintStatusSignature(
  signer: StatusSigner,
  credentialId: string,
  status: CredentialStatus,
  asOf: string,
): { value: string; asOf: string } {
  return { value: signer.sign({ credentialId, status, asOf }), asOf };
}
