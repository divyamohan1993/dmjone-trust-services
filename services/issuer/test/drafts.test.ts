import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {buildDeps} from './fakes.js';
import {createIssuerApp} from '../src/app.js';
import {mintSessionCookie} from './session-helper.js';
import {saveDraft,pauseDraft,dispatchDueDrafts,openDraft,eraseSourceDraft} from '../src/drafts/service.js';
import {dispatchDueEmails} from '../src/email/delivery.js';
let now:number;
beforeEach(()=>{now=Date.parse('2026-09-13T12:00:00+05:30');vi.spyOn(Date,'now').mockImplementation(()=>now);});
afterEach(()=>vi.restoreAllMocks());
const input={issueDate:'2026-09-13',recipientLines:['Asha Test'],subject:'Learning plan',salutation:'Dear Asha,',bodyParagraphs:['A two-month learning internship.'],password:'inert-private-password',recipientEmail:'inert@example.test',emailSendAt:'2026-09-14T09:15:00+05:30',attestation:true as const};
function fixture(){const deps=buildDeps();const sent:string[]=[];deps.emailQuota={reserve:async()=>true};deps.emailSender={provider:'oci',prepare:JSON.stringify,send:async body=>{sent.push(body);return {status:'accepted',providerId:'inert-id'};}};return {deps,sent};}
describe('reviewable scheduled drafts',()=>{
 it('saves privately without issuing or scheduling; reopening preserves editable fields',async()=>{
  const {deps,sent}=fixture();const d=await saveDraft(deps,{kind:'letter',input,schedule:false},'save');
  expect(d.state).toBe('draft');expect(deps.credentialRepo.createCount).toBe(0);expect(sent).toHaveLength(0);
  const stored=(await deps.draftRepo!.get(d.id))!;expect(JSON.stringify(stored)).not.toContain(input.password);expect(JSON.stringify(stored)).not.toContain(input.recipientEmail);
  now=Date.parse('2026-09-14T09:16:00+05:30');await dispatchDueDrafts(deps,'later');expect(sent).toHaveLength(0);
  expect(openDraft(deps,stored).input.bodyParagraphs).toEqual(input.bodyParagraphs);
 });
 it('uses the existing certificate pipeline for reviewed certificate drafts',async()=>{
  const {deps,sent}=fixture();
  const cert={type:'internship',recipientName:'Asha Test',kicker:'Certificate of',title:'INTERNSHIP',intro:'This is to certify that',bodyParagraphs:['completed a learning internship.'],issueDate:'2026-09-13',password:input.password,recipientEmail:input.recipientEmail,emailSendAt:input.emailSendAt,attestation:true as const};
  const d=await saveDraft(deps,{kind:'certificate',input:cert,schedule:true},'cert');expect(deps.credentialRepo.createCount).toBe(0);
  now=Date.parse(input.emailSendAt);await dispatchDueDrafts(deps,'due');
  expect(sent).toHaveLength(1);expect((await deps.credentialRepo.getByDraftId(d.id))?.content).toMatchObject({recipientName:'Asha Test',title:'INTERNSHIP'});
 });
 it('pauses a scheduled draft on review and sends only the last explicitly scheduled revision',async()=>{
  const {deps,sent}=fixture();const d=await saveDraft(deps,{kind:'letter',input,schedule:true},'schedule');
  const opened=await pauseDraft(deps,d.id,d.revision,'review');
  now=Date.parse('2026-09-14T09:15:00+05:30');await dispatchDueDrafts(deps,'paused');expect(sent).toHaveLength(0);
  const revised={...input,bodyParagraphs:['Revised agreed learning deliverables.'],emailSendAt:'2026-09-14T09:30:00+05:30'};
  await saveDraft(deps,{id:d.id,revision:opened.revision,kind:'letter',input:revised,schedule:true},'reschedule');
  now=Date.parse(revised.emailSendAt);await Promise.all([dispatchDueDrafts(deps,'due-a'),dispatchDueDrafts(deps,'due-b')]);
  expect(sent).toHaveLength(1);expect(deps.credentialRepo.createCount).toBe(1);
  const doc=[...deps.credentialRepo.records.values()][0]!;expect(doc.content.bodyParagraphs).toEqual(revised.bodyParagraphs);expect(doc.sourceDraftId).toBe(d.id);
  const done=(await deps.draftRepo!.get(d.id))!;expect(done.state).toBe('issued');expect(deps.secretSealer.openString(done.encryptedInput)).not.toContain(input.password);
  await dispatchDueEmails(deps,'again');expect(sent).toHaveLength(1);
 });
 it('rejects stale edits and edits after delivery starts',async()=>{
  const {deps}=fixture();const d=await saveDraft(deps,{kind:'letter',input,schedule:true},'create');
  const paused=await pauseDraft(deps,d.id,d.revision,'one');
  await expect(saveDraft(deps,{id:d.id,revision:d.revision,kind:'letter',input,schedule:true},'stale')).rejects.toThrow('changed');
  await saveDraft(deps,{id:d.id,revision:paused.revision,kind:'letter',input,schedule:true},'new');
  const record=(await deps.draftRepo!.get(d.id))!;
  await deps.draftRepo!.compareAndSet(d.id,record.revision,{...record,state:'issuing',revision:record.revision+1});
  await expect(pauseDraft(deps,d.id,record.revision+1,'too-late')).rejects.toThrow('delivery started');
 });
 it('allows template placeholders in a saved draft but refuses to schedule them',async()=>{
  const {deps}=fixture();const raw={...input,bodyParagraphs:['Learn [topic] with guidance.']};
  expect((await saveDraft(deps,{kind:'letter',input:raw,schedule:false},'draft')).state).toBe('draft');
  await expect(saveDraft(deps,{kind:'letter',input:raw,schedule:true},'bad')).rejects.toThrow();
 });
 it('requires explicit attestation, a recipient and a future working-time schedule',async()=>{
  const {deps}=fixture();
  for(const patch of [{attestation:false},{recipientEmail:undefined},{emailSendAt:'2026-09-14T18:00:00+05:30'}]){
   await expect(saveDraft(deps,{kind:'letter',input:{...input,...patch},schedule:true},'invalid')).rejects.toThrow();
  }
 });
 it('does not repeat issuance when an expired claim cannot be reconciled',async()=>{
  const {deps,sent}=fixture();const d=await saveDraft(deps,{kind:'letter',input,schedule:true},'new');
  const stored=(await deps.draftRepo!.get(d.id))!;
  await deps.draftRepo!.compareAndSet(d.id,stored.revision,{...stored,state:'issuing',revision:stored.revision+1,nextAttemptAt:now});
  now=Date.parse('2026-09-14T09:30:00+05:30');await dispatchDueDrafts(deps,'expired');
  expect((await deps.draftRepo!.get(d.id))?.state).toBe('needs_attention');expect(deps.credentialRepo.createCount).toBe(0);expect(sent).toHaveLength(0);
 });
 it('keeps an automatically scheduled weekend draft until the next weekday',async()=>{
  const {deps,sent}=fixture();const {emailSendAt:_,...automatic}=input;
  const d=await saveDraft(deps,{kind:'letter',input:automatic,schedule:true},'weekend');expect(d.scheduledFor).toBe('2026-09-14T03:30:00.000Z');
  await dispatchDueDrafts(deps,'still-weekend');expect(sent).toHaveLength(0);
  now=Date.parse('2026-09-14T09:00:00+05:30');await dispatchDueDrafts(deps,'monday');expect(sent).toHaveLength(1);
 });
 it('erases encrypted failed-draft copies and removes scheduling cursors',async()=>{
  const {deps}=fixture();const d=await saveDraft(deps,{kind:'letter',input,schedule:true},'draft');
  await eraseSourceDraft(deps,d.id);const stored=(await deps.draftRepo!.get(d.id))!;
  expect(stored.nextAttemptAt).toBeUndefined();expect(deps.secretSealer.openString(stored.encryptedInput)).not.toContain(input.recipientEmail);
 });
 it('enforces authentication, same-origin JSON and version checks at the API',async()=>{
  const {deps}=fixture();const app=createIssuerApp(deps);const body=JSON.stringify({kind:'letter',input,action:'save'});
  expect((await app.request('/api/drafts',{method:'POST',headers:{'content-type':'application/json'},body})).status).toBe(401);
  const cookie=await mintSessionCookie(deps.env);
  expect((await app.request('/api/drafts',{method:'POST',headers:{cookie,'content-type':'application/json',origin:'https://untrusted.test'},body})).status).toBe(403);
  const res=await app.request('/api/drafts',{method:'POST',headers:{cookie,'content-type':'application/json'},body});expect(res.status).toBe(201);
  const json=await res.json();
  const listed=await app.request('/api/drafts',{headers:{cookie}});expect(await listed.text()).not.toContain(input.password);
  const opened=await app.request('/api/drafts/'+json.draft.id,{headers:{cookie}});expect((await opened.json()).input.bodyParagraphs).toEqual(input.bodyParagraphs);
 });
});
