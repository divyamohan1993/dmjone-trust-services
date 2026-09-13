import {createIssuerApp} from '../src/app.js';
import {mintSessionCookie} from './session-helper.js';
import {createHash} from 'node:crypto';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {DEFAULT_NDA_PARAGRAPHS,OFFER_SIGNING_INSTRUCTIONS,OFFER_POLICY_NOTICE,ndaEnclosureLine,issueLetterSchema} from '@dmjone/shared';
import {buildDeps} from './fakes.js';
import {issueLetter} from '../src/issuance/issue-letter.js';
import {emailAfterIssuance,sendDocumentEmail} from '../src/email/delivery.js';
import {saveDraft,pauseDraft,dispatchDueDrafts} from '../src/drafts/service.js';
import {createOciEmailSender} from '../src/email/oci.js';
import {createResendEmailSender,messageText,type DocumentEmailAttachment} from '../src/email/provider.js';
let now:number;
beforeEach(()=>{now=Date.parse('2026-09-14T09:00:00+05:30');vi.spyOn(Date,'now').mockImplementation(()=>now);});
afterEach(()=>vi.restoreAllMocks());
const input={issueDate:'2026-09-14',recipientLines:['Asha Test'],subject:'Internship Offer — MERN & Applied AI',salutation:'Dear Asha,',bodyParagraphs:['We offer a learning internship.'],attestation:true as const,password:'inert-private-password',recipientEmail:'inert@example.test'};
function fixture(){
 const deps=buildDeps(),sent:{body:string;attachments:DocumentEmailAttachment[]}[]=[];
 deps.emailQuota={reserve:async()=>true};deps.emailSender={provider:'oci',prepare:JSON.stringify,send:async(body,_key,attachments=[])=>{sent.push({body,attachments});return {status:'accepted',providerId:'inert-id'};}};
 const original=deps.signer.sign.bind(deps.signer);
 deps.signer.sign=async(pdf,canonical)=>{const result=await original(pdf,canonical);const sha=createHash('sha256').update(result.signedPdf).digest('hex');const payload=canonical(sha);return {...result,pdfSha256:sha,canonicalPayload:payload,canonicalSha256:createHash('sha256').update(payload).digest('hex')};};
 return {deps,sent};
}
describe('offer and NDA packet',()=>{
 it('issues an independent NDA, binds its reference and hash, and attaches its exact bytes to one email',async()=>{
  const {deps,sent}=fixture();const {documentId}=await issueLetter(deps,input,{actor:'admin',requestId:'test'});
  expect(deps.credentialRepo.createCount).toBe(2);
  const parent=(await deps.credentialRepo.getById(documentId))!,nda=(await deps.credentialRepo.getById(parent.nda!.documentId))!;
  expect(nda.recipientEmailEnc).toBeUndefined();expect(nda.emailDelivery).toBeUndefined();
  expect(nda.content.bodyParagraphs).toEqual(DEFAULT_NDA_PARAGRAPHS);
  expect(parent.content.bodyParagraphs).toContain(ndaEnclosureLine(nda.id,nda.pdfSha256));
  expect(parent.canonicalPayload).toContain(nda.pdfSha256);expect(parent.content.bodyParagraphs).toContain(OFFER_SIGNING_INSTRUCTIONS);expect(parent.content.bodyParagraphs).toContain(OFFER_POLICY_NOTICE);
  expect(await emailAfterIssuance(deps,documentId,input.recipientEmail,'mail')).toMatchObject({status:'accepted'});
  expect(sent).toHaveLength(1);expect(sent[0]!.attachments).toHaveLength(1);
  expect(Buffer.from(sent[0]!.attachments[0]!.contentBase64,'base64')).toEqual(Buffer.from((await deps.blobStore.get(nda.id,'certificate'))!));
  expect(JSON.parse(sent[0]!.body).nda.downloadUrl).toContain(nda.verifyToken);
  expect(sent[0]!.body).toContain(input.password);
  const stored=(await deps.credentialRepo.getById(documentId))!;
  expect(deps.secretSealer.openString(stored.emailDelivery!.encryptedMessage)).not.toContain(sent[0]!.attachments[0]!.contentBase64);
 });
 it('refuses to attach a missing, changed, revoked or mismatched NDA',async()=>{
  const {deps,sent}=fixture();const {documentId}=await issueLetter(deps,input,{actor:'admin',requestId:'test'});
  const parent=(await deps.credentialRepo.getById(documentId))!;await deps.blobStore.put(parent.nda!.documentId,'certificate',Buffer.from('%PDF-changed'));
  await expect(sendDocumentEmail(deps,documentId,'tampered')).rejects.toThrow('does not match');expect(sent).toHaveLength(0);
 });
 it('does not send if the NDA is revoked after reading its bytes but before claiming delivery',async()=>{
  const {deps,sent}=fixture();const {documentId}=await issueLetter(deps,input,{actor:'admin',requestId:'race'});
  const ndaId=(await deps.credentialRepo.getById(documentId))!.nda!.documentId;
  deps.emailQuota={reserve:async()=>{await deps.credentialRepo.setStatus(ndaId,'revoked',new Date(now).toISOString());return true;}};
  await sendDocumentEmail(deps,documentId,'race-send');expect(sent).toHaveLength(0);
 });
 it('freezes edited NDA terms in a draft and waits for review before issuing either document',async()=>{
  const {deps,sent}=fixture();const raw={...input,emailSendAt:'2026-09-14T09:15:00+05:30'};
  const saved=await saveDraft(deps,{kind:'letter',input:raw,schedule:false},'save');expect(deps.credentialRepo.createCount).toBe(0);
  const opened=await pauseDraft(deps,saved.id,saved.revision,'review');
  const terms=['Use confidential project information only for the agreed work.','Return the signed documents to contact@dmj.one.'];
  await saveDraft(deps,{id:saved.id,revision:opened.revision,kind:'letter',input:{...raw,ndaBodyParagraphs:terms},schedule:true},'schedule');
  expect(sent).toHaveLength(0);now=Date.parse(raw.emailSendAt);await dispatchDueDrafts(deps,'due');
  const parent=(await deps.credentialRepo.getByDraftId(saved.id))!,nda=(await deps.credentialRepo.getById(parent.nda!.documentId))!;
  expect(nda.content.bodyParagraphs).toEqual([...terms,OFFER_POLICY_NOTICE]);expect(sent).toHaveLength(1);expect(deps.credentialRepo.createCount).toBe(2);
  await dispatchDueDrafts(deps,'again');expect(sent).toHaveLength(1);
 });
 it('holds a legacy queued offer until its newly required NDA has been reviewed',async()=>{
  const {deps,sent}=fixture();const raw={...input,emailSendAt:'2026-09-14T09:15:00+05:30'};
  const d=await saveDraft(deps,{kind:'letter',input:raw,schedule:true},'legacy');
  const row=(await deps.draftRepo!.get(d.id))!,payload=JSON.parse(deps.secretSealer.openString(row.encryptedInput));delete payload.input.ndaBodyParagraphs;
  await deps.draftRepo!.compareAndSet(d.id,row.revision,{...row,revision:row.revision+1,encryptedInput:deps.secretSealer.sealString(JSON.stringify(payload))});
  now=Date.parse(raw.emailSendAt);await dispatchDueDrafts(deps,'due');
  expect((await deps.draftRepo!.get(d.id))?.state).toBe('draft');expect(sent).toHaveLength(0);expect(deps.credentialRepo.createCount).toBe(0);
 });
 it('cancels a legacy offer email without sending it without an NDA',async()=>{
  const {deps,sent}=fixture();const {documentId}=await issueLetter(deps,{...input,subject:'Project note'},{actor:'admin',requestId:'legacy'});
  const legacy=deps.credentialRepo.records.get(documentId)!;legacy.content.subject='Internship offer';
  await expect(sendDocumentEmail(deps,documentId,'send')).rejects.toThrow('older offer has no NDA');
  expect((await deps.credentialRepo.getById(documentId))!.emailDelivery!.status).toBe('cancelled');expect(sent).toHaveLength(0);
 });
 it('erases both the offer and its NDA when the owner erases the packet',async()=>{
  const {deps}=fixture();const {documentId}=await issueLetter(deps,input,{actor:'admin',requestId:'packet'});
  const ndaId=(await deps.credentialRepo.getById(documentId))!.nda!.documentId;
  const app=createIssuerApp(deps),cookie=await mintSessionCookie(deps.env);
  const res=await app.request('/api/credentials/'+documentId+'/erase',{method:'POST',headers:{cookie,'content-type':'application/json'},body:'{}'});
  expect(res.status).toBe(200);expect((await deps.credentialRepo.getById(ndaId))!.erased).toBe(true);expect(await deps.blobStore.get(ndaId,'certificate')).toBeNull();
 });
 it('rejects unfilled NDA terms before scheduling',()=>{
  expect(issueLetterSchema.safeParse({...input,ndaBodyParagraphs:['Keep [information] confidential.']}).success).toBe(false);
 });
 it('leaves non-offer letters on the existing single-document path',async()=>{
  const {deps}=fixture();await issueLetter(deps,{...input,subject:'Project update'},{actor:'admin',requestId:'normal'});expect(deps.credentialRepo.createCount).toBe(1);
 });
});
describe('NDA attachment transport and onboarding instructions',()=>{
 const message={documentId:'DMJ-LTR-20260914-02',kind:'letter' as const,downloadPassword:'local-test-password',to:input.recipientEmail,downloadUrl:'https://verify.example.test/v/inert-offer',subject:input.subject,nda:{documentId:'DMJ-LTR-20260914-01',downloadUrl:'https://verify.example.test/v/inert-nda'}};
 const attachments=[{filename:'nda.pdf',contentBase64:Buffer.from('%PDF-inert-nda').toString('base64')}];
 it('instructs signing every page, returning both documents, then enrolling; links the governing policies',()=>{
  const text=messageText(message);expect(text).toContain('EVERY PAGE');expect(text).toContain('contact@dmj.one');expect(text).toContain('https://timesheet.dmj.one');expect(text).toContain('https://dmj.one/tos');expect(text).toContain('https://dmj.one/privacy');expect(text).toContain(message.downloadPassword);
 });
 it('uses inline PDF bytes in OCI without enabling file or URL access',async()=>{
  const sender=createOciEmailSender({username:'inert',password:'inert'},()=>({close:()=>{},sendMail:async(options:any)=>{
   expect(options.subject).toBe(input.subject);expect(options.attachments).toEqual([{filename:'nda.pdf',content:attachments[0]!.contentBase64,encoding:'base64',contentType:'application/pdf'}]);
   expect(options.disableFileAccess).toBe(true);expect(options.disableUrlAccess).toBe(true);return {accepted:[input.recipientEmail,'records@dmj.one'],messageId:'inert-id'};
  }}) as any);
  expect(await sender.send(sender.prepare(message),'inert-key',attachments)).toMatchObject({status:'accepted'});
 });
 it('passes the same inline bytes through the Resend adapter',async()=>{
  const sender=createResendEmailSender('re_inert_fixture_not_a_real_key',async(_url,init)=>{
   expect(JSON.parse(init!.body as string).attachments).toEqual([{filename:'nda.pdf',content:attachments[0]!.contentBase64}]);return Response.json({id:'inert-id'});
  });expect(await sender.send(sender.prepare(message),'inert-key',attachments)).toMatchObject({status:'accepted'});
 });
});
