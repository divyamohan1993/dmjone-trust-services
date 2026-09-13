import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createInMemoryEmailQuotaRepository } from '@dmjone/data';
import { createOciEmailSender, parseOciSmtpCredentials, OCI_SMTP_HOST } from '../src/email/oci.js';
import { sendDocumentEmail, emailAfterIssuance, emailSummary } from '../src/email/delivery.js';
import { buildDeps } from './fakes.js';
import { issueCredential } from '../src/issuance/issue.js';

const credentials = {username:'inert-smtp-user',password:'inert-smtp-password'};
const message = {documentId:'DMJ-IC-20260912-01',kind:'certificate' as const,to:'recipient@example.test',downloadUrl:'https://verify.example.test/v/inert-token'};
beforeEach(()=>{vi.spyOn(Date,'now').mockReturnValue(Date.parse('2026-09-14T04:30:00Z'));});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});

describe('OCI SMTP adapter',()=>{
  it('requires TLS, pins Phoenix, disables logging and sends one secure-link message',async()=>{
    const close = vi.fn(); const sendMail = vi.fn(async (body:any)=>({accepted:body.to,messageId:body.messageId}));
    const sender = createOciEmailSender(credentials, options=>{
      expect(options.host).toBe(OCI_SMTP_HOST); expect(options.port).toBe(587); expect(options.requireTLS).toBe(true);
      expect(options.tls).toMatchObject({rejectUnauthorized:true,minVersion:'TLSv1.2',servername:OCI_SMTP_HOST});
      expect(options.logger).toBe(false); expect(options.debug).toBe(false);
      return {sendMail,close} as any;
    });
    const body = sender.prepare(message);
    expect(JSON.parse(body)).toMatchObject({from:'dmj.one <contact@dmj.one>',to:[message.to],replyTo:'contact@dmj.one'});
    expect(body).toContain(message.downloadUrl); expect(body).not.toContain('attachments');
    expect(await sender.send(body,'not-an-smtp-dedup-key')).toMatchObject({status:'accepted'});
    expect(sendMail).toHaveBeenCalledTimes(1); expect(close).toHaveBeenCalled();
  });
  it.each([
    [{responseCode:535,command:'AUTH PLAIN'},'rejected'],
    [{responseCode:550,command:'RCPT TO'},'rejected'],
    [{responseCode:552,command:'DATA'},'rejected'],
    [{code:'ETIMEDOUT'},'uncertain'],
    [{responseCode:421,command:'DATA'},'uncertain'],
  ])('classifies failures without exposing SMTP responses',async(error,status)=>{
    const sender = createOciEmailSender(credentials,()=>({sendMail:async()=>{throw {...error,response:'private response'};},close:()=>{}} as any));
    const result = await sender.send(sender.prepare(message),'inert-key');
    expect(result).toEqual({status});
  });
  it('closes a hung SMTP operation and reports uncertainty',async()=>{
    vi.useFakeTimers(); const close=vi.fn();
    const sender=createOciEmailSender(credentials,()=>({sendMail:()=>new Promise(()=>{}),close} as any));
    const pending=sender.send(sender.prepare(message),'inert-key');
    await vi.advanceTimersByTimeAsync(30001);
    expect(await pending).toEqual({status:'uncertain'}); expect(close).toHaveBeenCalled();
  });
  it('reports malformed credential configuration without including its contents',()=>{
    expect(()=>parseOciSmtpCredentials('private-invalid-payload')).toThrow('OCI SMTP credentials are missing or invalid');
    expect(()=>parseOciSmtpCredentials(JSON.stringify({username:'x',password:'x\ny'}))).toThrow();
  });
});

async function issued(){
  const deps=buildDeps(); deps.emailQuota=createInMemoryEmailQuotaRepository();
  const send=vi.fn(async()=>({status:'uncertain' as const}));
  deps.emailSender={provider:'oci',prepare:JSON.stringify,send};
  const result=await issueCredential(deps,{type:'internship',recipientName:'Asha Rao',kicker:'Certificate of',title:'INTERNSHIP',intro:'This is to certify that',bodyParagraphs:['completed an educational internship.'],issueDate:'2026-09-12',attestation:true,password:'inert-document-password',recipientEmail:'recipient@example.test'},{requestId:'inert-request',actor:'admin'});
  return {deps,send,id:result.credentialId};
}
describe('OCI dispatch policy',()=>{
  it('never retries an uncertain SMTP outcome',async()=>{
    const {deps,send,id}=await issued();
    expect(await sendDocumentEmail(deps,id,'first')).toMatchObject({status:'outcome_unknown',canRetry:false});
    expect(await sendDocumentEmail(deps,id,'second')).toMatchObject({status:'outcome_unknown',canRetry:false});
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('treats an expired SMTP sending lease as unknown without another transmission',async()=>{
    const {deps,send,id}=await issued(); await sendDocumentEmail(deps,id,'first');
    const record=deps.credentialRepo.records.get(id)!;
    record.emailDelivery!.status='sending'; record.emailDelivery!.leaseUntil=Date.now()-1;
    expect(emailSummary(record)?.canRetry).toBe(false);
    expect((await sendDocumentEmail(deps,id,'recovery')).status).toBe('outcome_unknown');
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('preserves the signed document when the free allowance is exhausted',async()=>{
    const {deps,send,id}=await issued(); const now=Date.now();
    for(let i=0;i<90;i++)expect(await deps.emailQuota!.reserve(now)).toBe(true);
    expect(await emailAfterIssuance(deps,id,'recipient@example.test','limited')).toMatchObject({status:'quota_limited',canRetry:false});
    expect(send).not.toHaveBeenCalled(); expect(await deps.credentialRepo.getById(id)).toBeTruthy();
    expect(await deps.blobStore.get(id,'certificate')).toBeTruthy();
  });
  it('fails closed if the persistent budget is missing',async()=>{
    const {deps,send,id}=await issued(); delete deps.emailQuota;
    await expect(sendDocumentEmail(deps,id,'missing-quota')).rejects.toThrow('OCI email quota is not configured');
    expect(send).not.toHaveBeenCalled();
  });
});
