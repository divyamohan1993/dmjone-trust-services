/**
 * Document id allocation: `DMJ-<CODE>-<YYYYMMDD>-<NN>`.
 *
 * `<CODE>` is a 2–4 letter prefix identifying the document kind (a certificate
 * type code like `IC`, or a reserved kind prefix like `LTR`/`DOC`); `<YYYYMMDD>`
 * is the issue date; `<NN>` is the next free per-day sequence. All kinds share
 * the same per-day sequence space. The repository exposes only `exists(id)` (no
 * date-range query), so we probe upward from `01` until a free slot is found.
 * The single-admin model makes the probe→create window a non-issue (no
 * concurrent issuance), and `credentialRepo.create` is the final authority on
 * uniqueness.
 *
 * Certificate callers pass `credentialTypeCode(type)` (a preset's fixed code, or
 * a derived 2–4 letter code for a custom mode-1 type); letter/upload callers
 * pass `DOCUMENT_ID_PREFIX.letter` / `DOCUMENT_ID_PREFIX.upload`. Whatever the
 * prefix, the assembled id is re-validated against `CREDENTIAL_ID_REGEX` below,
 * so a bad derivation can never mint a malformed id.
 */

import { AppError, CREDENTIAL_ID_REGEX, ERROR_CODE } from '@dmjone/shared';
import type { CredentialRepository } from '@dmjone/shared';

/** Max per-day sequence; `NN` is two digits, so 99 documents/prefix/day. */
const MAX_DAILY_SEQ = 99;

/** A 2–4 uppercase-letter document-id prefix (matches CREDENTIAL_ID_REGEX). */
const PREFIX_RE = /^[A-Z]{2,4}$/;

/** Strip dashes from an ISO date (`2026-06-05` → `20260605`). */
function compactDate(isoDate: string): string {
  return isoDate.replace(/-/g, '');
}

/** Format the sequence as a zero-padded two-digit string. */
function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/**
 * Allocate the next unused document id for `prefix` on `issueDate`.
 * @param prefix a 2–4 uppercase-letter code (cert type code or kind prefix).
 * @throws AppError(CREDENTIAL_EXISTS) when all 99 daily slots are taken.
 */
export async function allocateCredentialId(
  repo: CredentialRepository,
  prefix: string,
  issueDate: string,
): Promise<string> {
  // Defence in depth: the prefix is the only caller-influenced segment of the
  // id, and a malformed one would mint ids that fail CREDENTIAL_ID_REGEX. All
  // current callers pass a constant, so a bad prefix is a programming error.
  if (!PREFIX_RE.test(prefix)) {
    throw new AppError(ERROR_CODE.INTERNAL, `Invalid document-id prefix: ${prefix}`, 500);
  }
  const datePart = compactDate(issueDate);
  for (let seq = 1; seq <= MAX_DAILY_SEQ; seq += 1) {
    const candidate = `DMJ-${prefix}-${datePart}-${pad2(seq)}`;
    if (!(await repo.exists(candidate))) {
      // Final invariant: the assembled id must match the shared id grammar.
      if (!CREDENTIAL_ID_REGEX.test(candidate)) {
        throw new AppError(ERROR_CODE.INTERNAL, `Malformed document id: ${candidate}`, 500);
      }
      return candidate;
    }
  }
  throw new AppError(
    ERROR_CODE.CREDENTIAL_EXISTS,
    `No free document-id slot for ${prefix} on ${datePart}`,
    409,
  );
}
