import { OCI_EMAIL_DAILY_LIMIT, OCI_EMAIL_MONTHLY_LIMIT, type EmailQuotaRepository } from '@dmjone/shared';
export { OCI_EMAIL_DAILY_LIMIT, OCI_EMAIL_MONTHLY_LIMIT };
import type { Firestore } from '@google-cloud/firestore';

// Below the documented 3,000/month free allowance. Limits are hard-coded so a
// deployment environment typo cannot silently raise the application's budget.
const DAY = 24 * 60 * 60 * 1000;
export interface EmailQuotaState { month: string; count: number; recent: number[]; lastAt: number }
export function reserveEmailQuota(previous: EmailQuotaState | null, now: number): EmailQuotaState | null {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('Email quota clock is invalid');
  const month = new Date(now).toISOString().slice(0,7);
  if (previous) {
    if (!/^\d{4}-\d{2}$/.test(previous.month) || !Number.isSafeInteger(previous.count) || previous.count < 0 ||
      !Number.isSafeInteger(previous.lastAt) || !Array.isArray(previous.recent) ||
      previous.recent.some(t => !Number.isSafeInteger(t) || t < 0 || t > previous.lastAt)) throw new Error('Email quota state is invalid');
    if (now < previous.lastAt) return null;
  }
  const recent = previous?.recent.filter(t => t > now - DAY) ?? [];
  const count = previous?.month === month ? previous.count : 0;
  if (recent.length >= OCI_EMAIL_DAILY_LIMIT || count >= OCI_EMAIL_MONTHLY_LIMIT) return null;
  return {month, count:count+1, recent:[...recent,now], lastAt:now};
}
export function createInMemoryEmailQuotaRepository(): EmailQuotaRepository {
  let state: EmailQuotaState | null = null;
  return {async reserve(now) {
    const next = reserveEmailQuota(state,now); if (!next) return false;
    state = next; return true;
  }};
}
export function createFirestoreEmailQuotaRepository(db: Firestore): EmailQuotaRepository {
  const ref = db.collection('email_quotas').doc('oci-trust');
  return {async reserve(now) {
    return db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      const next = reserveEmailQuota((snapshot.data() as EmailQuotaState | undefined) ?? null, now);
      if (!next) return false;
      tx.set(ref,next); return true;
    });
  }};
}
