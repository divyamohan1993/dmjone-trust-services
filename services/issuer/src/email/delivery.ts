import { randomUUID, createHash } from 'node:crypto';
import { AppError, ERROR_CODE, documentKind, ndaEnclosureLine, isOfferLetter } from '@dmjone/shared';
import type { CredentialRecord, DocumentEmailDelivery, LetterContent } from '@dmjone/shared';
import type { IssuerDeps } from '../deps.js';
import type { DocumentEmailMessage, DocumentEmailAttachment } from './provider.js';
import { recordsCc } from './template.js';
import { initialEmailDelivery, nextWorkingTime } from './schedule.js';

const RETRY_WINDOW = 23 * 60 * 60 * 1000; // shorter than Resend's 24-hour idempotency retention
const MAX_ATTEMPTS = 3;
export interface DeliverySummary {
  status: DocumentEmailDelivery['status'] | 'pending' | 'not_queued' | 'quota_limited';
  canRetry: boolean;
  scheduledFor?: string;
  nextAttemptAt?: string;
}
export function emailSummary(record: CredentialRecord, now = Date.now()): DeliverySummary | undefined {
  if (!record.recipientEmailEnc || record.erased) return undefined;
  const d = record.emailDelivery;
  return {
    status: d?.status ?? 'pending',
    ...(d?.scheduledFor !== undefined && {scheduledFor:new Date(d.scheduledFor).toISOString()}),
    ...(d?.nextAttemptAt !== undefined && {nextAttemptAt:new Date(d.nextAttemptAt).toISOString()}),
    canRetry: record.status === 'valid' && (!d || (['rejected','uncertain'].includes(d.status) &&
      d.attempts < MAX_ATTEMPTS && now >= d.createdAt && (d.provider === 'oci' || now < d.createdAt + RETRY_WINDOW) && now >= d.leaseUntil &&
      (d.provider !== 'oci' || d.status === 'rejected'))),
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

/** Remove the indexed cursor on every terminal outcome. */
function terminal(d: DocumentEmailDelivery, status: DocumentEmailDelivery['status']): DocumentEmailDelivery {
  const {nextAttemptAt:_, ...rest} = d;
  return {...rest,status,updatedAt:Date.now(),leaseUntil:Date.now()};
}
async function defer(deps: IssuerDeps, record: CredentialRecord, previous: DocumentEmailDelivery | null, until: number): Promise<DeliverySummary> {
  const base = previous ?? initialEmailDelivery(deps, 'already-encrypted')!;
  const next: DocumentEmailDelivery = {...base,status:'queued',nextAttemptAt:nextWorkingTime(until),updatedAt:Date.now(),leaseUntil:0};
  await deps.credentialRepo.compareAndSetEmailDelivery(record.id,previous,next);
  return emailSummary((await deps.credentialRepo.getById(record.id)) ?? record)!;
}

/** Awaited inside the request: Cloud Run may stop CPU after the response. */
export async function sendDocumentEmail(deps: IssuerDeps, documentId: string, requestId: string): Promise<DeliverySummary> {
  const sender = deps.emailSender;
  if (!sender) throw new AppError(ERROR_CODE.BAD_REQUEST, 'Email delivery is not configured', 503);
  const record = await deps.credentialRepo.getById(documentId);
  if (!record || record.erased || record.status !== 'valid' || !record.recipientEmailEnc || !record.verifyToken) {
    throw new AppError(ERROR_CODE.BAD_REQUEST, 'This document is not available for email delivery', 400);
  }
  const now = Date.now(), previous = record.emailDelivery ?? null;
  if (previous && ['accepted','cancelled','outcome_unknown'].includes(previous.status)) return emailSummary(record)!;
  if (previous?.provider === 'oci' && (previous.status === 'uncertain' || (previous.status === 'sending' && now >= previous.leaseUntil))) {
    await deps.credentialRepo.compareAndSetEmailDelivery(documentId,previous,terminal(previous,'outcome_unknown'));
    return {status:'outcome_unknown',canRetry:false};
  }
  if (previous && (previous.provider !== sender.provider || now < previous.createdAt ||
    (previous.attempts > 0 && previous.provider !== 'oci' && now >= previous.createdAt + RETRY_WINDOW) || previous.attempts >= MAX_ATTEMPTS)) {
    const status = previous.status === 'rejected' ? 'rejected' : 'outcome_unknown';
    await deps.credentialRepo.compareAndSetEmailDelivery(documentId,previous,terminal(previous,status));
    return {status,canRetry:false};
  }
  if (previous && now < previous.leaseUntil) return emailSummary(record)!;
  // Explicit schedules and quota deferrals cannot be bypassed with the retry API.
  const due = Math.max(now, previous?.scheduledFor ?? now, previous?.nextAttemptAt ?? now);
  const allowed = nextWorkingTime(due);
  if (allowed > now) return defer(deps,record,previous,allowed);

  // The outbox is committed with the record, before artifacts. Never transmit
  // until both are available, including recovery from a crashed issue request.
  const [pdf, section63] = await Promise.all([
    deps.blobStore.get(documentId, 'certificate'), deps.blobStore.get(documentId, 'section63'),
  ]);
  if (!pdf || !section63) throw new AppError(ERROR_CODE.BAD_REQUEST, 'Document generation is incomplete; email was not sent', 409);
  const kind = documentKind(record);
  if(!record.recipientPasswordEnc){
    const base=previous??initialEmailDelivery(deps,'already-encrypted')!;
    await deps.credentialRepo.compareAndSetEmailDelivery(documentId,previous,terminal(base,'cancelled'));
    throw new AppError(ERROR_CODE.BAD_REQUEST,'This older document has no recoverable download password. Prepare a new reviewed copy before emailing.',409);
  }
  const recipientName='recipientName' in record.content?record.content.recipientName:'recipientLines' in record.content?record.content.recipientLines[0]:undefined;
  const message: DocumentEmailMessage = {documentId, kind, downloadPassword:deps.secretSealer.openString(record.recipientPasswordEnc),...(recipientName&&{recipientName}), to:deps.secretSealer.openString(record.recipientEmailEnc), downloadUrl:`${deps.env.VERIFY_PUBLIC_URL}/v/${record.verifyToken}`};
  if(kind==='letter' && isOfferLetter(record.content as LetterContent) && !record.nda){
    const base=previous??initialEmailDelivery(deps,'already-encrypted')!;
    await deps.credentialRepo.compareAndSetEmailDelivery(documentId,previous,terminal(base,'cancelled'));
    throw new AppError(ERROR_CODE.BAD_REQUEST,'This older offer has no NDA; create a reviewed offer with its NDA before emailing',409);
  }
  const attachments:DocumentEmailAttachment[]=[];
  if(record.nda){
    const nda=await deps.credentialRepo.getById(record.nda.documentId);
    const bytes=nda?await deps.blobStore.get(nda.id,'certificate'):null;
    if(!nda || nda.erased || nda.status!=='valid' || !nda.verifyToken || !bytes || bytes.length>400*1024 ||
      nda.pdfSha256!==record.nda.pdfSha256 || createHash('sha256').update(bytes).digest('hex')!==record.nda.pdfSha256 ||
      !(record.content as LetterContent).bodyParagraphs.includes(ndaEnclosureLine(nda.id,nda.pdfSha256))) {
      throw new AppError(ERROR_CODE.BAD_REQUEST,'The required NDA is unavailable or does not match the offer; email was not sent',409);
    }
    message.nda={documentId:nda.id,downloadUrl:deps.env.VERIFY_PUBLIC_URL+'/v/'+nda.verifyToken};
    const subject=(record.content as LetterContent).subject;if(subject)message.subject=subject;
    attachments.push({filename:'dmj-one-NDA-'+nda.id+'.pdf',contentBase64:Buffer.from(bytes).toString('base64')});
  }
  const body = previous?.attempts ? deps.secretSealer.openString(previous.encryptedMessage) : sender.prepare(message);
  const claim: DocumentEmailDelivery = {
    status:'sending', provider:sender.provider,
    ...(previous?.scheduledFor !== undefined && {scheduledFor:previous.scheduledFor}),
    encryptedMessage:previous?.attempts ? previous.encryptedMessage : deps.secretSealer.sealString(body),
    createdAt:previous?.attempts ? previous.createdAt : now, updatedAt:now, attempts:(previous?.attempts ?? 0)+1,
    leaseId:randomUUID(), leaseUntil:now+60000, nextAttemptAt:now+60000,
  };
  if (sender.provider === 'oci') {
    if (!deps.emailQuota) throw new AppError(ERROR_CODE.INTERNAL,'OCI email quota is not configured',503);
    if (!await deps.emailQuota.reserve(now,1+recordsCc(message.to).length)) {
      const summary = await defer(deps,record,previous,now+15*60_000);
      return {...summary,status:'quota_limited'};
    }
  }
  if (!await deps.credentialRepo.compareAndSetEmailDelivery(documentId, previous, claim)) {
    const current = await deps.credentialRepo.getById(documentId);
    return current ? emailSummary(current) ?? {status:'not_queued', canRetry:false} : {status:'not_queued', canRetry:false};
  }
  // Recheck the business window immediately before submission. Avoid starting
  // a bounded 30-second SMTP operation that could extend past 5 PM.
  const submissionDeadline = Date.now()+35_000;
  if (nextWorkingTime(submissionDeadline) !== submissionDeadline) {
    const restore = previous ?? initialEmailDelivery(deps,'already-encrypted')!;
    await deps.credentialRepo.compareAndSetEmailDelivery(documentId,claim,{...restore,status:'queued',
      nextAttemptAt:nextWorkingTime(Date.now()+35_000),updatedAt:Date.now(),leaseUntil:0});
    return emailSummary((await deps.credentialRepo.getById(documentId))!)!;
  }
  // Freeze the payload across attempts. SMTP has no idempotency guarantee:
  // timeouts or expired leases must never cause an automatic second submission.
  let result: Awaited<ReturnType<typeof sender.send>>;
  if (Date.now() + (sender.provider === 'oci' ? 35000 : 20000) >= claim.leaseUntil || (sender.provider !== 'oci' && Date.now() >= claim.createdAt + RETRY_WINDOW)) result = {status:'uncertain'};
  else {
    try { result = await sender.send(body, `dmj-trust-v1/${documentId}`, attachments); }
    catch { result = {status:'uncertain'}; }
  }
  const done: DocumentEmailDelivery = {...terminal(claim,sender.provider === 'oci' && result.status === 'uncertain' ? 'outcome_unknown' : result.status),
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

/** A bounded, durable queue drain. Invoked by authenticated Cloud Scheduler. */
export async function dispatchDueEmails(deps: IssuerDeps, requestId: string): Promise<{processed:number}> {
  const now = Date.now();
  if (nextWorkingTime(now) !== now) return {processed:0};
  const records = await deps.credentialRepo.listDueEmails(now,4);
  for (let start=0; start<records.length; start+=2) {
    await Promise.all(records.slice(start,start+2).map(async record => {
      const d = record.emailDelivery!;
      if (record.erased || record.status !== 'valid') {
        await deps.credentialRepo.compareAndSetEmailDelivery(record.id,d,terminal(d,'cancelled'));
        return;
      }
      try {await sendDocumentEmail(deps,record.id,requestId);}
      catch {
        // Database/artifact outages are safe to retry: CAS cannot overwrite an
        // acquired sending lease or terminal outcome with this stale snapshot.
        await defer(deps,record,d,Date.now()+5*60_000);
        deps.logger.warn({documentId:record.id,requestId},'scheduled email deferred; check generation and mail configuration');
      }
    }));
  }
  return {processed:records.length};
}
