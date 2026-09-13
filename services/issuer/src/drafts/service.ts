import {DEFAULT_NDA_PARAGRAPHS,isOfferLetter} from '@dmjone/shared';
import {randomUUID,randomBytes} from 'node:crypto';
import {AppError,ERROR_CODE,issueCredentialSchema,issueCredentialObject,issueLetterSchema,issueLetterObject,signUploadSchema} from '@dmjone/shared';
import type {DocumentDraft,DocumentKind,IssueCredentialInput,IssueLetterInput,SignUploadInput} from '@dmjone/shared';
import type {IssuerDeps} from '../deps.js';
import {nextWorkingTime,validateEmailSchedule} from '../email/schedule.js';
import {emailAfterIssuance,requireEmailConfiguration} from '../email/delivery.js';
import {issueCredential} from '../issuance/issue.js';
import {issueLetter} from '../issuance/issue-letter.js';
import {attestUpload} from '../issuance/attest-upload.js';
import {inspectPdf} from '@dmjone/render';

export type DraftInput = IssueCredentialInput | IssueLetterInput | SignUploadInput;
interface PrivateDraft {input:DraftInput;uploadBlobKey?:string}
const bad=(message:string,status=400)=>new AppError(ERROR_CODE.BAD_REQUEST,message,status);
export function draftRepo(deps:IssuerDeps){if(!deps.draftRepo)throw bad('Draft storage is not configured',503);return deps.draftRepo;}
export function validateDraftId(id:string):void{if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))throw bad('Invalid draft ID');}
export function openDraft(deps:IssuerDeps,draft:DocumentDraft):PrivateDraft{return JSON.parse(deps.secretSealer.openString(draft.encryptedInput)) as PrivateDraft;}
export function draftSummary(deps:IssuerDeps,draft:DocumentDraft){
  const {input}=openDraft(deps,draft);
  const label='recipientName' in input?input.recipientName:'subject' in input?input.subject: 'originalFilename' in input?input.originalFilename:'Letter';
  return {id:draft.id,kind:draft.kind,state:draft.state,revision:draft.revision,label:label||'Untitled letter',recipientEmail:input.recipientEmail,
    ...(draft.scheduledFor!==undefined&&{scheduledFor:new Date(draft.scheduledFor).toISOString()}),...(draft.documentId&&{documentId:draft.documentId})};
}
function parseInput(kind:DocumentKind,raw:unknown,schedule:boolean):DraftInput{
  if(!raw || typeof raw!=='object' || Array.isArray(raw))throw bad('Invalid draft input');
  const input=raw as Record<string,unknown>;
  if(schedule && input.attestation!==true)throw bad('Confirm the issuer attestation before scheduling');
  const schema=kind==='certificate'?(schedule?issueCredentialSchema:issueCredentialObject):kind==='letter'?(schedule?issueLetterSchema:issueLetterObject):signUploadSchema;
  const parsed=schema.safeParse({...input,attestation:true,password:input.password||randomBytes(32).toString('base64url')});
  if(!parsed.success)throw new AppError(ERROR_CODE.VALIDATION_FAILED,'Complete the required document fields before saving',400,parsed.error.flatten());
  if(kind==='letter' && isOfferLetter(parsed.data as IssueLetterInput)){
    const offer=parsed.data as IssueLetterInput;return {...offer,offerLetter:true,ndaBodyParagraphs:offer.ndaBodyParagraphs??[...DEFAULT_NDA_PARAGRAPHS]};
  }
  return parsed.data;
}
export async function getDraftInput(deps:IssuerDeps,draft:DocumentDraft){
  const payload=openDraft(deps,draft);
  if(payload.uploadBlobKey){
    const blob=await deps.blobStore.get(payload.uploadBlobKey,'certificate');
    if(!blob)throw bad('The draft PDF is unavailable',409);
    return {...payload.input,pdfBase64:deps.secretSealer.openString(Buffer.from(blob).toString('utf8'))};
  }
  return payload.input;
}
export async function saveDraft(deps:IssuerDeps,args:{id?:string;revision?:number;kind:DocumentKind;input:unknown;schedule:boolean},requestId:string){
  const repo=draftRepo(deps),id=args.id??randomUUID();validateDraftId(id);
  const previous=await repo.get(id);
  if(previous && (!['draft','scheduled'].includes(previous.state) || previous.revision!==args.revision))throw bad('This draft changed or delivery started. Refresh before editing.',409);
  if(previous && previous.kind!==args.kind)throw bad('The document type cannot change');
  if(!previous && args.revision!==undefined && args.revision!==0)throw bad('Draft not found',404);
  const input=parseInput(args.kind,args.input,args.schedule);
  if(args.schedule){
    if(!input.recipientEmail)throw bad('Choose a recipient email before scheduling');
    validateEmailSchedule(input.recipientEmail,input.emailSendAt);requireEmailConfiguration(deps,input.recipientEmail);
  }
  const now=Date.now(),revision=(previous?.revision??0)+1;
  const payload:PrivateDraft={input};
  // Uploaded draft bytes are encrypted separately and chunked below Firestore's document limit.
  if(args.kind==='upload'){
    const base64=(args.input as {pdfBase64?:unknown}).pdfBase64;
    if(typeof base64!=='string' || base64.length>14_000_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64))throw bad('Choose a PDF up to 10 MiB');
    const bytes=Buffer.from(base64,'base64');if(bytes.length>10*1024*1024 || !bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw bad('Choose a readable PDF up to 10 MiB');
    try{await inspectPdf(bytes);}catch{throw bad('The uploaded PDF must be readable and unencrypted');}
    payload.uploadBlobKey='draft-'+id+'-'+randomUUID();
    await deps.blobStore.put(payload.uploadBlobKey,'certificate',Buffer.from(deps.secretSealer.sealString(base64),'utf8'));
  }
  const scheduledFor=args.schedule?nextWorkingTime(Math.max(now,input.emailSendAt?Date.parse(input.emailSendAt):now)):undefined;
  const next:DocumentDraft={id,kind:args.kind,state:args.schedule?'scheduled':'draft',revision,createdAt:previous?.createdAt??now,updatedAt:now,
    encryptedInput:deps.secretSealer.sealString(JSON.stringify(payload)),
    ...(previous?.sourceDocumentId&&{sourceDocumentId:previous.sourceDocumentId}),
    ...(scheduledFor!==undefined&&{scheduledFor,nextAttemptAt:scheduledFor})};
  try{
    if(previous){if(!await repo.compareAndSet(id,previous.revision,next))throw bad('This draft changed or delivery started. Refresh before editing.',409);}
    else await repo.create(next);
  }catch(error){if(payload.uploadBlobKey)await deps.blobStore.delete(payload.uploadBlobKey,'certificate');throw error;}
  // The new version is durable before its old, unreferenced uploaded bytes are removed.
  if(previous){const old=openDraft(deps,previous);if(old.uploadBlobKey)await deps.blobStore.delete(old.uploadBlobKey,'certificate');}
  await deps.auditLog.append({actor:'admin',action:args.schedule?'document.draft.scheduled':'document.draft.saved',subject:id,requestId,meta:{revision,...(scheduledFor!==undefined&&{scheduledFor:new Date(scheduledFor).toISOString()})}});
  return draftSummary(deps,next);
}
export async function pauseDraft(deps:IssuerDeps,id:string,revision:number,requestId:string){
  validateDraftId(id);const repo=draftRepo(deps),previous=await repo.get(id);
  if(!previous || previous.revision!==revision || !['draft','scheduled'].includes(previous.state))throw bad('This draft changed or delivery started. Refresh before editing.',409);
  const {scheduledFor:_,nextAttemptAt:__,...rest}=previous;
  const next:DocumentDraft={...rest,state:'draft',revision:revision+1,updatedAt:Date.now()};
  if(!await repo.compareAndSet(id,revision,next))throw bad('Delivery started or this draft changed. Refresh its status.',409);
  await deps.auditLog.append({actor:'admin',action:'document.draft.paused_for_review',subject:id,requestId});
  return {...draftSummary(deps,next),input:await getDraftInput(deps,next)};
}
async function finish(deps:IssuerDeps,draft:DocumentDraft,state:DocumentDraft['state'],documentId?:string){
  const {nextAttemptAt:_,...rest}=draft;
  const next:DocumentDraft={...rest,state,revision:draft.revision+1,updatedAt:Date.now(),...(documentId&&{documentId})};
  if(state==='issued') {
    const payload=openDraft(deps,draft);
    if(payload.uploadBlobKey)await deps.blobStore.delete(payload.uploadBlobKey,'certificate');
    // After issuance, the signed record is authoritative. Do not retain another
    // copy of the person's data or the plaintext-equivalent download password.
    next.encryptedInput=deps.secretSealer.sealString(JSON.stringify({input:{subject:'Issued document'}}));
  }
  await draftRepo(deps).compareAndSet(draft.id,draft.revision,next);
}
export async function dispatchDueDrafts(deps:IssuerDeps,requestId:string):Promise<{draftsProcessed:number}>{
  if(!deps.draftRepo)return {draftsProcessed:0};
  const now=Date.now();if(nextWorkingTime(now)!==now)return {draftsProcessed:0};
  const due=await deps.draftRepo.listDue(now,1);
  for(const draft of due){
    if(draft.state==='issuing'){
      // An expired processing claim is inspected, never blindly reissued.
      const existing=await deps.credentialRepo.getByDraftId(draft.id);
      const complete=existing && await deps.blobStore.get(existing.id,'certificate') && await deps.blobStore.get(existing.id,'section63');
      await finish(deps,draft,complete?'issued':'needs_attention',existing?.id);continue;
    }
    if(draft.state!=='scheduled')continue;
    const claim:DocumentDraft={...draft,state:'issuing',revision:draft.revision+1,updatedAt:now,nextAttemptAt:now+5*60_000};
    if(!await deps.draftRepo.compareAndSet(draft.id,draft.revision,claim))continue;
    try{
      const full=await getDraftInput(deps,claim);
      if(claim.kind==='letter' && isOfferLetter(full as IssueLetterInput) && !(full as IssueLetterInput).ndaBodyParagraphs){
        // Never add previously unreviewed legal terms to a legacy queued draft.
        const {nextAttemptAt:_,scheduledFor:__,...held}=claim;
        await deps.draftRepo.compareAndSet(claim.id,claim.revision,{...held,state:'draft',revision:claim.revision+1,updatedAt:Date.now()});
        await deps.auditLog.append({actor:'system',action:'document.draft.nda_review_required',subject:claim.id,requestId});
        continue;
      }
      const input=parseInput(claim.kind,full,true);
      requireEmailConfiguration(deps,input.recipientEmail);
      const ctx={actor:'scheduled-draft',requestId,draftId:claim.id};
      let id:string;
      if(claim.kind==='letter')id=(await issueLetter(deps,input as IssueLetterInput,ctx)).documentId;
      else if(claim.kind==='certificate')id=(await issueCredential(deps,input as IssueCredentialInput,ctx)).credentialId;
      else id=(await attestUpload(deps,input as SignUploadInput,Buffer.from((full as {pdfBase64:string}).pdfBase64,'base64'),ctx)).documentId;
      await finish(deps,claim,'issued',id);
      await emailAfterIssuance(deps,id,input.recipientEmail,requestId);
      await deps.auditLog.append({actor:'system',action:'document.draft.issued',subject:id,requestId,meta:{draftId:claim.id,revision:claim.revision}});
    }catch{
      // The credential outbox independently survives crashes after artifact storage.
      const existing=await deps.credentialRepo.getByDraftId(claim.id);
      await finish(deps,claim,'needs_attention',existing?.id);
      deps.logger.warn({draftId:claim.id,requestId},'scheduled draft needs attention; no automatic reissuance');
    }
  }
  return {draftsProcessed:due.length};
}

/** Erasure must also remove any recoverable failed-draft copy. */
export async function eraseSourceDraft(deps:IssuerDeps,draftId:string):Promise<void>{
  if(!deps.draftRepo)return;
  for(let attempt=0;attempt<5;attempt++){
    const d=await deps.draftRepo.get(draftId);if(!d)return;
    const payload=openDraft(deps,d);if(payload.uploadBlobKey)await deps.blobStore.delete(payload.uploadBlobKey,'certificate');
    const {nextAttemptAt:_,...rest}=d;
    if(await deps.draftRepo.compareAndSet(draftId,d.revision,{...rest,state:'issued',revision:d.revision+1,updatedAt:Date.now(),
      encryptedInput:deps.secretSealer.sealString(JSON.stringify({input:{subject:'Erased document'}}))}))return;
  }
  throw bad('Draft erasure needs another attempt',409);
}
