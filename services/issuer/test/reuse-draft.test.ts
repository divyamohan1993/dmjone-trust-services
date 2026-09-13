import {describe,it,expect} from 'vitest';
import {buildDeps} from './fakes.js';
import {saveDraft,getDraftInput} from '../src/drafts/service.js';
import {reuseDraft} from '../src/drafts/reuse.js';
import {issueLetter} from '../src/issuance/issue-letter.js';
import {normalizeLetterPunctuation,issueLetterSchema} from '@dmjone/shared';
import {createIssuerApp} from '../src/app.js';
import {mintSessionCookie} from './session-helper.js';
const input={issueDate:'2026-09-14',recipientLines:['Asha Rao','Student ID: GF202200001'],subject:'Internship Offer — MERN',reference:'Offer for Asha Rao',salutation:'Dear Asha,',bodyParagraphs:['Asha Rao will learn the MERN stack.','I appreciate your decision to decline the remuneration offered.'],ndaBodyParagraphs:['Confidential project information must be protected.'],password:'inert-old-password',recipientEmail:'asha@example.test',attestation:true as const};
describe('reuse for a new candidate',()=>{
 it('creates a separate held draft with a fresh password and removes the prior identity and schedule',async()=>{
  const deps=buildDeps();const source=await saveDraft(deps,{kind:'letter',input,schedule:false},'source');const before=await deps.draftRepo!.get(source.id);
  const copied=await reuseDraft(deps,source.id,source.revision,'copy');
  expect(copied.id).not.toBe(source.id);expect(copied.state).toBe('draft');expect(copied.scheduledFor).toBeUndefined();
  expect(copied.input.password).not.toBe(input.password);expect(copied.input.recipientEmail).toBeUndefined();expect(copied.input.emailSendAt).toBeUndefined();
  expect(copied.input.recipientLines).toEqual(['[Full legal name]']);expect(copied.input.salutation).toBe('Dear [first name],');
  expect(JSON.stringify(copied.input)).not.toContain('Asha Rao');expect(JSON.stringify(copied.input)).not.toContain('GF202200001');
  expect(copied.input.bodyParagraphs.join(' ')).toContain('[Review candidate-specific statement.]');
  expect(issueLetterSchema.safeParse(copied.input).success).toBe(false);
  expect(await deps.draftRepo!.get(source.id)).toEqual(before);expect(deps.credentialRepo.createCount).toBe(0);
 });
 it('can reuse an issued offer after its draft input was purged, without copying the old NDA reference',async()=>{
  const deps=buildDeps();const source=await saveDraft(deps,{kind:'letter',input,schedule:false},'source');
  const {documentId}=await issueLetter(deps,input,{actor:'admin',requestId:'issued',draftId:source.id});
  const record=(await deps.credentialRepo.getById(documentId))!;
  const old=(await deps.draftRepo!.get(source.id))!;
  await deps.draftRepo!.compareAndSet(source.id,old.revision,{...old,revision:old.revision+1,state:'issued',documentId,encryptedInput:deps.secretSealer.sealString(JSON.stringify({input:{subject:'Issued document'}}))});
  const copy=await reuseDraft(deps,source.id,old.revision+1,'copy');
  expect(copy.input.ndaBodyParagraphs).toEqual(input.ndaBodyParagraphs);
  expect(JSON.stringify(copy.input)).not.toContain(record.nda!.documentId);expect(JSON.stringify(copy.input)).not.toContain(record.nda!.pdfSha256);
  expect(copy.state).toBe('draft');expect(copy.input.password).not.toBe(input.password);
 });
 it('rejects stale source revisions and unauthenticated copy requests',async()=>{
  const deps=buildDeps(),app=createIssuerApp(deps);const d=await saveDraft(deps,{kind:'letter',input,schedule:false},'source');
  await expect(reuseDraft(deps,d.id,d.revision+1,'stale')).rejects.toThrow('source changed');
  expect((await app.request('/api/drafts/'+d.id+'/reuse',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({revision:d.revision})})).status).toBe(401);
  const cookie=await mintSessionCookie(deps.env);
  const result=await app.request('/api/drafts/'+d.id+'/reuse',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({revision:d.revision})});
  expect(result.status).toBe(201);const json=await result.json();expect(json.newCandidate).toBe(true);expect(json.input.recipientEmail).toBeUndefined();
 });
 it('normalizes correspondence punctuation without modifying passwords or delivery identifiers',async()=>{
  const raw={...input,password:'private₹—password'};const normalized=normalizeLetterPunctuation(raw);
  expect(normalized.subject).toBe('Internship Offer - MERN');expect(normalizeLetterPunctuation('Stipend: ₹0')).toBe('Stipend: INR 0');expect(normalized.password).toBe(raw.password);
  const deps=buildDeps();const d=await saveDraft(deps,{kind:'letter',input:raw,schedule:false},'punctuation');
  const saved=await getDraftInput(deps,(await deps.draftRepo!.get(d.id))!);expect(saved.subject).not.toContain('—');expect(saved.password).toBe(raw.password);
 });
});
