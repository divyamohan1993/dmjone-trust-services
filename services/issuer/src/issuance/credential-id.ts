/**
 * Credential id allocation: `DMJ-<TYPE>-<YYYYMMDD>-<NN>`.
 *
 * `<TYPE>` is the two-letter code for the credential type; `<YYYYMMDD>` is the
 * issue date; `<NN>` is the next free per-day sequence. The repository exposes
 * only `exists(id)` (no date-range query), so we probe upward from `01` until a
 * free slot is found. The single-admin model makes the probe→create window a
 * non-issue (no concurrent issuance), and `credentialRepo.create` is the final
 * authority on uniqueness.
 */

import { AppError, CREDENTIAL_TYPE_CODES, ERROR_CODE } from '@dmjone/shared';
import type { CredentialRepository, CredentialType } from '@dmjone/shared';

/** Max per-day sequence; `NN` is two digits, so 99 credentials/type/day. */
const MAX_DAILY_SEQ = 99;

/** Strip dashes from an ISO date (`2026-06-05` → `20260605`). */
function compactDate(isoDate: string): string {
  return isoDate.replace(/-/g, '');
}

/** Format the sequence as a zero-padded two-digit string. */
function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/**
 * Allocate the next unused credential id for `type` on `issueDate`.
 * @throws AppError(CREDENTIAL_EXISTS) when all 99 daily slots are taken.
 */
export async function allocateCredentialId(
  repo: CredentialRepository,
  type: CredentialType,
  issueDate: string,
): Promise<string> {
  const typeCode = CREDENTIAL_TYPE_CODES[type];
  const datePart = compactDate(issueDate);
  for (let seq = 1; seq <= MAX_DAILY_SEQ; seq += 1) {
    const candidate = `DMJ-${typeCode}-${datePart}-${pad2(seq)}`;
    if (!(await repo.exists(candidate))) {
      return candidate;
    }
  }
  throw new AppError(
    ERROR_CODE.CREDENTIAL_EXISTS,
    `No free credential-id slot for ${typeCode} on ${datePart}`,
    409,
  );
}
