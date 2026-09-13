import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createIssuerApp } from '../src/app.js';
import { buildDeps } from './fakes.js';
import { mintSessionCookie } from './session-helper.js';
import { sendDocumentEmail } from '../src/email/delivery.js';
import { createResendEmailSender, createPactmailEmailSender, type DocumentEmailOutcome } from '../src/email/provider.js';

const recipient = 'recipient@example.test';
const cert = {type:'internship', recipientName:'Asha Rao', kicker:'Certificate of', title:'INTERNSHIP', intro:'This is to certify that',
  bodyParagraphs:['completed an educational internship.'], issueDate:'2026-09-12', attestation:true, password:'local-test-password', recipientEmail:recipient};
const letter = {recipientLines:['Asha Rao'], subject:'Offer letter', bodyParagraphs:['We are pleased to offer you a position.'],
  issueDate:'2026-09-12', attestation:true, password:'local-test-password', recipientEmail:recipient};
beforeEach(()=>{vi.spyOn(Date,'now').mockReturnValue(Date.parse('2026-09-14T04:30:00Z'));});
afterEach(() => {vi.restoreAllMocks(); vi.useRealTimers();});
async function fixture(result: DocumentEmailOutcome = {status:'accepted',providerId:'inert-mail-id'}) {
  const deps = buildDeps(); const calls: {body:string; key:string}[] = [];
  deps.emailSender = {provider:'resend', prepare:JSON.stringify, async send(body,key) {
    calls.push({body,key});
    const id = JSON.parse(body).documentId;
    expect(await deps.credentialRepo.getById(id)).toBeTruthy();
    expect(await deps.blobStore.get(id,'certificate')).toBeTruthy();
    expect(await deps.blobStore.get(id,'section63')).toBeTruthy();
    return result;
  }};
  const app = createIssuerApp(deps); const cookie = await mintSessionCookie(deps.env);
  const post = (path:string, body:unknown = {}) => app.request(path,{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify(body)});
  return {deps, app, cookie, calls, post};
}

describe('generate, secure, and email documents', () => {
  it.each([['certificate','/api/credentials',cert,'credentialId'],['letter','/api/letters',letter,'documentId']] as const)('emails a %s only after it is secured and stored', async (_kind,path,input,idField) => {
    const {deps,calls,post} = await fixture(); const res = await post(path,input);
    expect(res.status).toBe(201); const data = await res.json();
    expect(data.email.status).toBe('accepted'); expect(calls).toHaveLength(1);
    expect(calls[0]!.key).toBe(`dmj-trust-v1/${data[idField]}`);
    const record = await deps.credentialRepo.getById(data[idField]);
    const message = JSON.parse(calls[0]!.body);
    expect(message.to).toBe(recipient); expect(message.downloadUrl).toBe(`https://verify.example.test/v/${record!.verifyToken}`);
    expect(calls[0]!.body).not.toContain(input.password);
    expect(JSON.stringify(record!.content)).not.toContain(recipient);
    expect(record!.canonicalPayload).not.toContain(recipient);
    expect(record!.recipientEmailEnc).not.toContain(recipient);
    expect(record!.emailDelivery!.encryptedMessage).not.toContain(recipient);
  });

  it('rejects an invalid address or missing sending configuration before generation', async () => {
    const {deps,post,calls} = await fixture();
    expect((await post('/api/credentials',{...cert,recipientEmail:'not-an-email'})).status).toBe(400);
    delete deps.emailSender;
    expect((await post('/api/credentials',cert)).status).toBe(503);
    expect(deps.credentialRepo.records.size).toBe(0); expect(calls).toHaveLength(0);
  });

  it('rejects non-JSON and cross-origin browser email requests', async () => {
    const {deps,app,cookie,calls} = await fixture();
    for (const headers of [
      {cookie,'content-type':'text/plain'},
      {cookie,'content-type':'application/json',origin:'https://untrusted.example'},
    ]) {
      const res = await app.request('/api/credentials',{method:'POST',headers,body:JSON.stringify(cert)});
      expect([403,415]).toContain(res.status);
    }
    expect(calls).toHaveLength(0); expect(deps.credentialRepo.records.size).toBe(0);
  });

  it('keeps generate-only requests working and previews never send email', async () => {
    const {post,calls} = await fixture(); const {recipientEmail:_,...input} = cert;
    expect((await post('/api/credentials',input)).status).toBe(201);
    const {password:__,attestation:___,...preview} = cert;
    expect((await post('/api/credentials/preview',preview)).status).toBe(200);
    expect(calls).toHaveLength(0);
  });

  it('preserves the document after a mail failure and retries the same message without regeneration', async () => {
    const {deps,post,calls,app,cookie} = await fixture({status:'uncertain'});
    const created = await (await post('/api/credentials',cert)).json();
    expect(created.email.status).toBe('uncertain'); expect(deps.credentialRepo.records.size).toBe(1);
    const original = calls[0];
    deps.emailSender!.prepare = () => 'changed-template-must-not-be-used';
    expect((await post(`/api/credentials/${created.credentialId}/email/retry`)).status).toBe(200);
    expect(calls).toHaveLength(2); expect(calls[1]).toEqual(original);
    expect(deps.credentialRepo.records.size).toBe(1);
    const listed = await (await app.request('/api/credentials',{headers:{cookie}})).json();
    expect(listed.items[0].email.status).toBe('uncertain');
    expect(JSON.stringify(listed)).not.toContain(recipient);
    expect(JSON.stringify(listed)).not.toContain('encryptedMessage');
  });

  it('never resends accepted email', async () => {
    const {post,calls} = await fixture(); const created = await (await post('/api/credentials',cert)).json();
    await post(`/api/credentials/${created.credentialId}/email/retry`);
    expect(calls).toHaveLength(1);
  });

  it('leases concurrent retries across requests', async () => {
    const {deps,post,calls} = await fixture({status:'uncertain'});
    const created = await (await post('/api/credentials',cert)).json();
    let release!: () => void; const held = new Promise<void>(r => {release=r;});
    const original = deps.emailSender!.send;
    deps.emailSender!.send = async (...args) => {await held; return original(...args);};
    const first = sendDocumentEmail(deps,created.credentialId,'local-first');
    const second = sendDocumentEmail(deps,created.credentialId,'local-second');
    release(); await Promise.all([first,second]); expect(calls).toHaveLength(2);
  });

  it('refuses uncertain retries after the safe idempotency window or a provider change', async () => {
    const {deps,post,calls} = await fixture({status:'uncertain'});
    const created = await (await post('/api/credentials',cert)).json();
    const record = deps.credentialRepo.records.get(created.credentialId)!;
    record.emailDelivery!.createdAt = Date.now() - 24*60*60*1000;
    expect((await sendDocumentEmail(deps,created.credentialId,'late')).status).toBe('outcome_unknown');
    expect(calls).toHaveLength(1);
  });

  it('refuses to email revoked, erased, or incomplete documents', async () => {
    const {deps,post,calls} = await fixture({status:'uncertain'});
    const created = await (await post('/api/credentials',cert)).json();
    const record = deps.credentialRepo.records.get(created.credentialId)!;
    record.status = 'revoked'; await expect(sendDocumentEmail(deps,record.id,'revoked')).rejects.toThrow();
    record.status = 'valid'; await deps.blobStore.delete(record.id,'section63');
    await expect(sendDocumentEmail(deps,record.id,'incomplete')).rejects.toThrow();
    await deps.credentialRepo.erase(record.id,new Date().toISOString());
    expect(record.recipientEmailEnc).toBeUndefined(); expect(record.emailDelivery).toBeUndefined();
    await expect(sendDocumentEmail(deps,record.id,'erased')).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });
});

describe('outbound provider boundaries', () => {
  const message = {documentId:'DMJ-LTR-20260912-01',kind:'letter' as const,to:recipient,downloadUrl:'https://verify.dmj.one/v/inert-example-token'};
  it('uses contact@dmj.one, includes the secure link, omits the password and follows no redirects', async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.redirect).toBe('error');
      expect(new Headers(init?.headers).get('Idempotency-Key')).toBe('inert-key');
      const body = JSON.parse(init?.body as string);
      expect(body.from).toBe('dmj.one <contact@dmj.one>'); expect(body.to).toEqual([recipient]);
      expect(body.text).toContain(message.downloadUrl); expect(body.text).toContain('shared separately'); expect(body.attachments).toBeUndefined();
      return Response.json({id:'inert-provider-id'});
    });
    const sender = createResendEmailSender('re_inert_fixture_not_a_real_key',fetcher);
    expect(await sender.send(sender.prepare(message),'inert-key')).toEqual({status:'accepted',providerId:'inert-provider-id'});
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.resend.com/emails');
  });
  it.each([400,401,403,422,429,500])('handles provider HTTP %s without leaking response bodies', async status => {
    const sender = createResendEmailSender('re_inert_fixture_not_a_real_key',async () => new Response('sensitive-provider-response',{status}));
    const result = await sender.send(sender.prepare(message),'inert-key');
    expect(result.status).toBe([400,401,403,422].includes(status) ? 'rejected' : 'uncertain');
    expect(JSON.stringify(result)).not.toContain('sensitive');
  });
  it('does not dispatch mail if service identity acquisition hangs', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn();
    const sender = createPactmailEmailSender('https://pactmail.example.test/api/send', () => new Promise(() => {}), fetcher);
    const pending = sender.send(sender.prepare(message), 'inert-key');
    await vi.advanceTimersByTimeAsync(8001);
    expect(await pending).toEqual({status:'uncertain'});
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('uses the Pactmail service identity contract without a provider key', async () => {
    const sender = createPactmailEmailSender('https://pactmail.example.test/api/send',async () => 'inert-id-token',async (_url,init) => {
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer inert-id-token');
      expect(JSON.parse(init?.body as string)).toEqual(message);
      return Response.json({status:'accepted',providerId:'inert-provider-id'});
    });
    expect(await sender.send(sender.prepare(message),'inert-key')).toMatchObject({status:'accepted'});
  });
});
