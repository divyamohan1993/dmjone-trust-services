import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { OAuth2Client } from 'google-auth-library';
import { buildDeps } from './fakes.js';
import { mintSessionCookie } from './session-helper.js';
import { createIssuerApp } from '../src/app.js';
import { dispatchDueEmails, sendDocumentEmail } from '../src/email/delivery.js';
import { nextWorkingTime, validateEmailSchedule } from '../src/email/schedule.js';
import { buildEmailSchedulerVerifier } from '../src/email/scheduler-auth.js';
import { issueLetter } from '../src/issuance/issue-letter.js';
import { createInMemoryEmailQuotaRepository } from '@dmjone/data';

let now: number;
beforeEach(()=>{now=Date.parse('2026-09-13T12:00:00+05:30');vi.spyOn(Date,'now').mockImplementation(()=>now);});
afterEach(()=>vi.restoreAllMocks());
const input = {issueDate:'2026-09-13',recipientLines:['Nitin Test'],subject:'Learning invitation',
  bodyParagraphs:['An educational internship offer.'],attestation:true as const,password:'inert-test-password',recipientEmail:'inert@example.test'};
async function fixture(sendAt?: string){
  const deps=buildDeps(); const sent: string[]=[];
  deps.emailQuota=createInMemoryEmailQuotaRepository();
  deps.emailSender={provider:'oci',prepare:JSON.stringify,send:async body=>{sent.push(body);return {status:'accepted',providerId:'inert-mail-id'};}};
  const result=await issueLetter(deps,{...input,...(sendAt && {emailSendAt:sendAt})},{actor:'admin',requestId:'fixture'});
  return {deps,sent,id:result.documentId};
}

describe('IST weekday scheduling',()=>{
  it.each([
    ['2026-09-14T08:59:59+05:30','2026-09-14T09:00:00+05:30'],
    ['2026-09-14T09:00:00+05:30','2026-09-14T09:00:00+05:30'],
    ['2026-09-14T16:59:59+05:30','2026-09-14T16:59:59+05:30'],
    ['2026-09-14T17:00:00+05:30','2026-09-15T09:00:00+05:30'],
    ['2026-09-18T18:00:00+05:30','2026-09-21T09:00:00+05:30'],
    ['2026-09-19T09:00:00+05:30','2026-09-21T09:00:00+05:30'],
    ['2026-09-20T23:00:00+05:30','2026-09-21T09:00:00+05:30'],
    ['2026-12-31T18:00:00+05:30','2027-01-01T09:00:00+05:30'],
  ])('maps %s to %s independent of the host timezone',(from,to)=>{
    expect(new Date(nextWorkingTime(Date.parse(from))).toISOString()).toBe(new Date(to).toISOString());
  });
  it('rejects past, missing-recipient, weekend and out-of-hours explicit times',()=>{
    for(const at of ['2026-09-12T09:15:00+05:30','2026-09-19T09:15:00+05:30','2026-09-14T17:00:00+05:30','bad']) {
      expect(()=>validateEmailSchedule(input.recipientEmail,at,now)).toThrow();
    }
    expect(()=>validateEmailSchedule(undefined,'2026-09-14T09:15:00+05:30',now)).toThrow();
    expect(()=>validateEmailSchedule(input.recipientEmail,'2026-09-14T09:15:00+05:30',now)).not.toThrow();
  });
  it('stores a Sunday issue durably, then sends once on Monday after restarting the app',async()=>{
    const {deps,sent,id}=await fixture();
    expect(await sendDocumentEmail(deps,id,'sunday')).toMatchObject({status:'queued',scheduledFor:'2026-09-14T03:30:00.000Z'});
    expect((await deps.credentialRepo.getById(id))?.emailDelivery?.attempts).toBe(0);
    expect(await dispatchDueEmails(deps,'weekend')).toEqual({processed:0});
    expect(sent).toHaveLength(0);
    now=Date.parse('2026-09-14T09:00:00+05:30');
    const app=createIssuerApp({...deps,verifyEmailScheduler:async token=>token==='inert-trusted-token'});
    expect((await app.request('/api/internal/email/dispatch',{method:'POST'})).status).toBe(403);
    const results=await Promise.all([1,2].map(()=>app.request('/api/internal/email/dispatch',{method:'POST',headers:{authorization:'Bearer inert-trusted-token'}})));
    expect(results.map(r=>r.status)).toEqual([200,200]);expect(sent).toHaveLength(1);
    expect(sent[0]).not.toContain(input.password);
    expect(await deps.credentialRepo.listDueEmails(now+120_000,10)).toHaveLength(0);
  });
  it('respects 9:15 AM even through retry calls and does not expire a long-future schedule',async()=>{
    const {deps,sent,id}=await fixture('2026-10-05T09:15:00+05:30');
    now=Date.parse('2026-10-05T09:00:00+05:30');
    expect((await sendDocumentEmail(deps,id,'early-retry')).status).toBe('queued');
    await dispatchDueEmails(deps,'early');expect(sent).toHaveLength(0);
    now=Date.parse('2026-10-05T09:15:00+05:30');
    await dispatchDueEmails(deps,'due');expect(sent).toHaveLength(1);
    await dispatchDueEmails(deps,'again');expect(sent).toHaveLength(1);
  });
  it('postpones an overdue delivery to the next weekday after an outage',async()=>{
    const {deps,sent,id}=await fixture('2026-09-18T16:00:00+05:30');
    now=Date.parse('2026-09-18T18:00:00+05:30');
    expect(await sendDocumentEmail(deps,id,'late')).toMatchObject({status:'queued',nextAttemptAt:'2026-09-21T03:30:00.000Z'});
    expect(sent).toHaveLength(0);
  });
  it('does not start SMTP near the 5 PM boundary',async()=>{
    const {deps,sent,id}=await fixture();now=Date.parse('2026-09-14T16:59:40+05:30');
    expect((await sendDocumentEmail(deps,id,'close')).status).toBe('queued');expect(sent).toHaveLength(0);
    expect((await deps.credentialRepo.getById(id))?.emailDelivery?.attempts).toBe(0);
  });
  it('defers quota exhaustion durably without consuming an SMTP attempt',async()=>{
    const {deps,sent,id}=await fixture();now=Date.parse('2026-09-14T09:00:00+05:30');
    deps.emailQuota={reserve:async()=>false};
    expect(await sendDocumentEmail(deps,id,'full')).toMatchObject({status:'quota_limited',nextAttemptAt:'2026-09-14T03:45:00.000Z'});
    expect((await deps.credentialRepo.getById(id))?.emailDelivery?.attempts).toBe(0);expect(sent).toHaveLength(0);
    deps.emailQuota={reserve:async()=>true};now+=15*60_000;await dispatchDueEmails(deps,'retry');expect(sent).toHaveLength(1);
  });
  it('does not send revoked, erased, cancelled, or incomplete queued documents',async()=>{
    const {deps,sent,id}=await fixture();
    const app=createIssuerApp(deps);const cookie=await mintSessionCookie(deps.env);
    const res=await app.request(`/api/credentials/${id}/email/cancel`,{method:'POST',headers:{cookie,'content-type':'application/json'},body:'{}'});
    expect(res.status).toBe(200);
    now=Date.parse('2026-09-14T09:00:00+05:30');await dispatchDueEmails(deps,'cancelled');expect(sent).toHaveLength(0);
    expect(await deps.credentialRepo.listDueEmails(now,10)).toHaveLength(0);
    const other=await fixture();await other.deps.credentialRepo.setStatus(other.id,'revoked',new Date(now).toISOString());
    await dispatchDueEmails(other.deps,'revoked');expect(other.sent).toHaveLength(0);
    expect((await other.deps.credentialRepo.getById(other.id))?.emailDelivery?.status).toBe('cancelled');
    const incomplete=await fixture();await incomplete.deps.blobStore.delete(incomplete.id,'section63');
    await dispatchDueEmails(incomplete.deps,'incomplete');expect(incomplete.sent).toHaveLength(0);
    expect((await incomplete.deps.credentialRepo.getById(incomplete.id))?.emailDelivery?.nextAttemptAt).toBe(now+5*60_000);
    await incomplete.deps.credentialRepo.erase(incomplete.id,new Date(now).toISOString());now+=6*60_000;
    await dispatchDueEmails(incomplete.deps,'erased');expect(incomplete.sent).toHaveLength(0);
  });
  it('recovers an expired SMTP lease without a duplicate submission',async()=>{
    const {deps,sent,id}=await fixture();now=Date.parse('2026-09-14T09:00:00+05:30');
    const record=deps.credentialRepo.records.get(id)!;
    Object.assign(record.emailDelivery!,{status:'sending',attempts:1,leaseUntil:now-1,nextAttemptAt:now-1});
    await dispatchDueEmails(deps,'crash');expect(sent).toHaveLength(0);
    expect((await deps.credentialRepo.getById(id))?.emailDelivery?.status).toBe('outcome_unknown');
    expect(await deps.credentialRepo.listDueEmails(now,10)).toHaveLength(0);
  });
  it('rejects bad schedules at the HTTP boundary before generating a document',async()=>{
    const deps=buildDeps();deps.emailSender={provider:'oci',prepare:JSON.stringify,send:vi.fn()};
    const app=createIssuerApp(deps);const cookie=await mintSessionCookie(deps.env);
    for (const at of ['2026-09-14T08:00:00+05:30','2026-09-12T09:15:00+05:30']) {
      const res=await app.request('/api/letters',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({...input,emailSendAt:at})});
      expect(res.status).toBe(400);
    }
    expect(deps.credentialRepo.createCount).toBe(0);
  });
});

describe('scheduler OIDC identity',()=>{
  it('pins audience and verified service-account identity; rejects bad tokens',async()=>{
    const deps=buildDeps(); const account='scheduler@example.iam.gserviceaccount.com',audience='https://issuer.example.test';
    const verify=buildEmailSchedulerVerifier({...deps.env,EMAIL_SCHEDULER_ACCOUNT:account,EMAIL_SCHEDULER_AUDIENCE:audience})!;
    const mock=vi.spyOn(OAuth2Client.prototype,'verifyIdToken');
    for(const payload of [{email:account,email_verified:true},{email:'other@example.test',email_verified:true},{email:account,email_verified:false}]){
      mock.mockResolvedValue({getPayload:()=>payload} as never);
      expect(await verify('inert-jwt')).toBe(payload.email===account && payload.email_verified);
    }
    expect(mock).toHaveBeenCalledWith({idToken:'inert-jwt',audience});
    mock.mockRejectedValue(new Error('bad token'));expect(await verify('invalid')).toBe(false);
    expect(buildEmailSchedulerVerifier(deps.env)).toBeUndefined();
  });
});
