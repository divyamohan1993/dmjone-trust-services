/**
 * The pure verification core. No I/O, no HTTP — just the rules that turn a set
 * of cryptographic checks into a single, honest verdict.
 *
 * Both /api/verify/:credentialId (id lookup) and /api/verify/file (upload)
 * funnel through {@link deriveOutcome}, so the meaning of VALID / TAMPERED /
 * REVOKED / UNKNOWN is defined in exactly one place. Changing the precedence
 * here changes it for the whole service.
 */

import type {
  AnchorRepository,
  CredentialRecord,
  LogRepository,
  LogVerifier,
  PublicCredentialFields,
  VerificationChecks,
  VerificationOutcome,
} from '@dmjone/shared';

/**
 * Collapse the individual checks into one outcome.
 *
 * Precedence (most-to-least severe), chosen so we never overclaim:
 *  1. hashMatch === false  → `tampered`
 *     The distributed bytes differ from what was signed. Only reachable in the
 *     file-upload flow (id lookup serves bytes by construction, so hashMatch is
 *     always true there). This dominates everything: if the bytes are altered,
 *     the right answer is "tampered", not "the signature is bad".
 *  2. mldsaSignature false OR logInclusion false → `unknown`
 *     We cannot establish authenticity / transparency-log membership, so we
 *     decline to assert anything about the record — including its revocation
 *     state (claiming "revoked" would imply we trust the record).
 *  3. notRevoked === false → `revoked`
 *     Cryptographically sound, but the issuer has revoked it.
 *  4. otherwise → `valid`.
 *
 * NOTE: `anchorProof` is deliberately NOT a gate. External anchoring is
 * periodic (hourly), so a freshly-issued, perfectly valid credential has no
 * anchor yet. It is surfaced as an informational check (anchored vs pending),
 * never as a reason to downgrade a verdict.
 */
export function deriveOutcome(checks: VerificationChecks): VerificationOutcome {
  if (!checks.hashMatch) return 'tampered';
  if (!checks.mldsaSignature || !checks.logInclusion) return 'unknown';
  if (!checks.notRevoked) return 'revoked';
  return 'valid';
}

/** Project the record down to exactly the HR/legal subset shown without a password. */
export function publicFieldsOf(record: CredentialRecord, issuer: string): PublicCredentialFields {
  return {
    recipientName: record.content.recipientName,
    kicker: record.content.kicker,
    title: record.content.title,
    type: record.content.type,
    issueDate: record.content.issueDate,
    issuer,
    status: record.status,
  };
}

/**
 * Is the leaf for this credential present in the transparency log, with a leaf
 * hash matching the canonical digest, under a head we can verify?
 *
 * leaf = computeLeafHash(canonicalSha256); we recompute it and compare to the
 * stored leaf, then verify the current signed tree head. (Full Merkle audit
 * paths are a Phase-2 item; v1 checks leaf consistency + a signed head, which
 * already binds the leaf into the tamper-evident chain.)
 */
export async function checkLogInclusion(
  record: CredentialRecord,
  logRepo: LogRepository,
  logVerifier: LogVerifier,
): Promise<boolean> {
  const leaf = await logRepo.getLeafByCredential(record.id);
  if (!leaf) return false;
  if (leaf.leafHash !== logVerifier.computeLeafHash(record.canonicalSha256)) return false;
  const head = await logRepo.getHead();
  if (!head) return false;
  return logVerifier.verifyHead(head);
}

/**
 * Is this credential's log entry covered by an external anchor yet?
 *
 * The truer "covered" test is `latest anchored head seq >= this credential's
 * log seq`, because not every head is individually anchored — only periodic
 * heads are. Swappable: at integration the orchestrator can point this at
 * `anchorRepo.forHead(seq)` instead if the data layer anchors every head.
 * Either way this is informational only and never gates the outcome.
 */
export async function checkAnchor(
  record: CredentialRecord,
  anchorRepo: AnchorRepository,
): Promise<boolean> {
  const latest = await anchorRepo.latest();
  return latest !== null && latest.headSeq >= record.logSeq;
}
