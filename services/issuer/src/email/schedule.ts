import { AppError, ERROR_CODE } from '@dmjone/shared';
import type { DocumentEmailDelivery } from '@dmjone/shared';
import type { IssuerDeps } from '../deps.js';

const IST_OFFSET = 330 * 60_000;
const DAY = 24 * 60 * 60_000;
/** Asia/Kolkata is UTC+05:30, with no daylight-saving transitions. */
export function nextWorkingTime(instant: number): number {
  const local = new Date(instant + IST_OFFSET);
  const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  let candidate = Math.max(instant + IST_OFFSET, midnight + 9 * 60 * 60_000);
  if (candidate >= midnight + 17 * 60 * 60_000) candidate = midnight + DAY + 9 * 60 * 60_000;
  while ([0, 6].includes(new Date(candidate).getUTCDay())) {
    const date = new Date(candidate);
    candidate = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) + DAY + 9 * 60 * 60_000;
  }
  return candidate - IST_OFFSET;
}

/** Validate before issuing anything; never silently move an explicitly chosen time. */
export function validateEmailSchedule(recipientEmail?: string, sendAt?: string, now = Date.now()): void {
  if (!sendAt) return;
  if (!recipientEmail) throw new AppError(ERROR_CODE.BAD_REQUEST, 'Choose a recipient email to schedule delivery', 400);
  const instant = Date.parse(sendAt);
  if (!Number.isFinite(instant) || instant <= now) throw new AppError(ERROR_CODE.BAD_REQUEST, 'Choose a future email delivery time', 400);
  if (nextWorkingTime(instant) !== instant) throw new AppError(ERROR_CODE.BAD_REQUEST,
    'Choose Monday–Friday, from 9:00 AM to before 5:00 PM IST (Asia/Kolkata)', 400);
}

/** Persist the outbox with the document, so a closed browser or request crash cannot lose the schedule. */
export function initialEmailDelivery(deps: IssuerDeps, recipientEmail?: string, sendAt?: string): DocumentEmailDelivery | undefined {
  if (!recipientEmail || !deps.emailSender) return undefined;
  const now = Date.now();
  const scheduledFor = nextWorkingTime(Math.max(now, sendAt ? Date.parse(sendAt) : now));
  return {status:'queued', provider:deps.emailSender.provider, scheduledFor, nextAttemptAt:scheduledFor,
    // Prepare and freeze the provider payload at the first actual submission.
    encryptedMessage:'', createdAt:now, updatedAt:now, attempts:0, leaseId:'', leaseUntil:0};
}
