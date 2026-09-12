import { randomUUID } from 'node:crypto';
import { AppError, ERROR_CODE, documentKind } from '@dmjone/shared';
import type { CredentialRecord, DocumentEmailDelivery } from '@dmjone/shared';
import type { IssuerDeps } from '../deps.js';
import type { DocumentEmailMessage } from './provider.js';

const RETRY_WINDOW = 23 * 60 * 60 * 1000; // shorter than Resend's 24-hour idempotency retention
const MAX_ATTEMPTS = 3;
export interface DeliverySummary {
  status: DocumentEmailDelivery['status'] | 'pending' | 'not_queued';
  canRetry: boolean;
}
export function emailSummary(record: CredentialRecord, now = Date.now()): DeliverySummary | undefined {
  if (!record.recipientEmailEnc || record.erased) return undefined;
  const d = record.emailDelivery;
  return {
    status: d?.status ?? 'pending',
    canRetry: record.status === 'valid' && (!d || (d.status !== 'accepted' && d.status !== 'outcome_unknown' &&
      d.attempts < MAX_ATTEMPTS && now >= d.createdAt && now < d.createdAt + RETRY_WINDOW && now >= d.leaseUntil)),
  };
}
export function requireEmailRequest(c: {req: {header(name: string): string | undefined}}, deps: IssuerDeps): void {
  if (c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
    throw new AppError(ERROR_CODE.BAD_REQUEST, 'Email requests require application/json', 415);
  }
  const origin = c.req.header('origin');
  if (origin && origin !== deps.env.ISSUER_PUBLIC_URL) throw new AppError(ERROR_CODE.FORBIDDEN, 'Email requests require the issuer origin', 403);
}

export function requireEmailConfiguration(deps: IssuerDeps, recipientEmail?: string): void {
  if (recipientEmail && !deps.emailSender) {
    throw new AppError(ERROR_CODE.BAD_REQUEST, 'Email delivery is not configured; no document has been generated', 503);
  }
}

/** Awaited inside the request: Cloud Run may stop CPU after the response. */
export async function sendDocumentEmail(deps: IssuerDeps, documentId: string, requestId: string): Promise<DeliverySummary> {
  const sender = deps.emailSender;
  if (!sender) throw new AppError(ERROR_CODE.BAD_REQUEST, 'Email delivery is not configured', 503);
  const record = await deps.credentialRepo.getById(documentId);
  if (!record || record.erased || record.status !== 'valid' || !record.recipientEmailEnc || !record.verifyToken) {
    throw new AppError(ERROR_CODE.BAD_REQUEST, 'This document is not available for email delivery', 400);
  }
  // Never email a document whose issuance did not finish storing both artifacts.
  const [pdf, section63] = await Promise.all([
    deps.blobStore.get(documentId, 'certificate'), deps.blobStore.get(documentId, 'section63'),
  ]);
  if (!pdf || !section63) throw new AppError(ERROR_CODE.BAD_REQUEST, 'Document generation is incomplete; email was not sent', 409);
  const now = Date.now(), previous = record.emailDelivery ?? null;
  if (previous?.status === 'accepted') return {status:'accepted', canRetry:false};
  if (previous && (previous.provider !== sender.provider || now < previous.createdAt || now >= previous.createdAt + RETRY_WINDOW || previous.attempts >= MAX_ATTEMPTS)) {
    if (previous.status === 'rejected') return {status:'rejected', canRetry:false};
    if (previous.status !== 'outcome_unknown') await deps.credentialRepo.compareAndSetEmailDelivery(documentId, previous, {...previous, status:'outcome_unknown', updatedAt:now});
    return {status:'outcome_unknown', canRetry:false};
  }
  if (previous?.status === 'outcome_unknown') return {status:'outcome_unknown', canRetry:false};
  if (previous && now < previous.leaseUntil) return {status:previous.status, canRetry:false};
  const kind = documentKind(record);
  if (kind !== 'certificate' && kind !== 'letter') throw new AppError(ERROR_CODE.BAD_REQUEST, 'Email automation supports certificates and letters', 400);
  const message: DocumentEmailMessage = {documentId, kind, to:deps.secretSealer.openString(record.recipientEmailEnc), downloadUrl:`${deps.env.VERIFY_PUBLIC_URL}/v/${record.verifyToken}`};
  const body = previous ? deps.secretSealer.openString(previous.encryptedMessage) : sender.prepare(message);
  const claim: DocumentEmailDelivery = {
    status:'sending', provider:sender.provider,
    encryptedMessage:previous?.encryptedMessage ?? deps.secretSealer.sealString(body),
    createdAt:previous?.createdAt ?? now, updatedAt:now, attempts:(previous?.attempts ?? 0)+1,
    leaseId:randomUUID(), leaseUntil:now+60000,
  };
  if (!await deps.credentialRepo.compareAndSetEmailDelivery(documentId, previous, claim)) {
    const current = await deps.credentialRepo.getById(documentId);
    return current ? emailSummary(current) ?? {status:'not_queued', canRetry:false} : {status:'not_queued', canRetry:false};
  }
  // Freeze the provider payload and key across all attempts; never auto-resend
  // an uncertain result outside the provider's deduplication window.
  let result: Awaited<ReturnType<typeof sender.send>>;
  if (Date.now() + 20000 >= claim.leaseUntil || Date.now() >= claim.createdAt + RETRY_WINDOW) result = {status:'uncertain'};
  else {
    try { result = await sender.send(body, `dmj-trust-v1/${documentId}`); }
    catch { result = {status:'uncertain'}; }
  }
  const done: DocumentEmailDelivery = {...claim, status:result.status, updatedAt:Date.now(), leaseUntil:Date.now(),
    ...(result.status === 'accepted' && {providerId:result.providerId}),
  };
  const stored = await deps.credentialRepo.compareAndSetEmailDelivery(documentId, claim, done);
  await deps.auditLog.append({actor:'system', action:`document.email.${stored ? result.status : 'outcome_unrecorded'}`, subject:documentId, requestId});
  if (!stored) return {status:'uncertain', canRetry:false};
  return emailSummary({...record, emailDelivery:done})!;
}

/** Delivery failures must never make the client reissue an already signed document. */
export async function emailAfterIssuance(deps: IssuerDeps, documentId: string, recipientEmail: string | undefined, requestId: string): Promise<DeliverySummary | undefined> {
  if (!recipientEmail) return undefined;
  try {return await sendDocumentEmail(deps, documentId, requestId);}
  catch {
    deps.logger.warn({documentId, requestId}, 'document generated; email delivery needs attention');
    const record = await deps.credentialRepo.getById(documentId).catch(() => null);
    return record ? emailSummary(record) ?? {status:'not_queued', canRetry:false} : {status:'not_queued', canRetry:false};
  }
}
