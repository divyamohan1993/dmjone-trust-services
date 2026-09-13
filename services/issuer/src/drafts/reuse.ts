import {randomBytes,randomUUID} from 'node:crypto';
import {AppError,ERROR_CODE,isOfferLetter,normalizeLetterPunctuation,OFFER_POLICY_NOTICE,OFFER_SIGNING_INSTRUCTIONS} from '@dmjone/shared';
import type {CredentialContent,LetterContent,IssueLetterInput,IssueCredentialInput,DocumentDraft} from '@dmjone/shared';
import type {IssuerDeps} from '../deps.js';
import {draftRepo,draftSummary,getDraftInput,validateDraftId} from './service.js';

const fail=(message:string)=>new AppError(ERROR_CODE.BAD_REQUEST,message,409);
/** Create a private, unscheduled copy. Never carry a candidate's identity or credentials forward. */
export async function reuseDraft(deps:IssuerDeps,id:string,revision:number,requestId:string){
 validateDraftId(id);const repo=draftRepo(deps),source=await repo.get(id);
 if(!source || source.revision!==revision || !['draft','scheduled','issued'].includes(source.state))throw fail('The source changed or is being issued. Refresh before reusing it.');
 if(source.kind==='upload')throw fail('Use a fresh PDF for a different candidate; uploaded PDFs may contain personal details.');
 let input:IssueLetterInput|IssueCredentialInput;
 if(source.state==='issued'){
  const record=source.documentId?await deps.credentialRepo.getById(source.documentId):null;
  if(!record || record.erased)throw fail('The source document is unavailable. Start from a new template.');
  if(source.kind==='letter'){
   const c=record.content as LetterContent;
   let terms:string[]|undefined;
   if(record.nda){const nda=await deps.credentialRepo.getById(record.nda.documentId);if(!nda || nda.erased)throw fail('The source NDA is unavailable. Start from a new template.');terms=(nda.content as LetterContent).bodyParagraphs.filter(p=>p!==OFFER_POLICY_NOTICE);}
   input={issueDate:c.issueDate,recipientLines:c.recipientLines,bodyParagraphs:c.bodyParagraphs,
    ...(c.subject!==undefined&&{subject:c.subject}),...(c.reference!==undefined&&{reference:c.reference}),...(c.salutation!==undefined&&{salutation:c.salutation}),...(c.valediction!==undefined&&{valediction:c.valediction}),
    offerLetter:!!record.nda||isOfferLetter(c),...(terms&&{ndaBodyParagraphs:terms}),password:'',attestation:true};
  }else{const {credentialId:_,signatory:__,...c}=record.content as CredentialContent;input={...c,password:'',attestation:true};}
  if(record.recipientEmailEnc)input.recipientEmail=deps.secretSealer.openString(record.recipientEmailEnc);
 }else input=await getDraftInput(deps,source) as IssueLetterInput|IssueCredentialInput;
 const person='recipientName' in input?input.recipientName:input.recipientLines[0]??'';
 const lines='recipientLines' in input?input.recipientLines:[];
 const identities=[person,input.recipientEmail??'',...lines.slice(1),...lines.flatMap(line=>line.match(/\b[A-Z]{1,6}\d{4,}\b/g)??[])].filter(v=>v.length>=2);
 function clean(text:string){
  for(const identity of identities){
   const escaped=identity.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
   text=text.replace(new RegExp('(?<![\\p{L}\\p{N}])'+escaped+'(?![\\p{L}\\p{N}])','giu'),'[candidate details]');
  }
  return text;
 }
 const copy=structuredClone(input);delete copy.recipientEmail;delete copy.emailSendAt;
 copy.password=randomBytes(32).toString('base64url');copy.issueDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 copy.bodyParagraphs=copy.bodyParagraphs.filter(p=>!p.startsWith('Enclosure: Non-disclosure agreement DMJ-') && !(source.kind==='letter'&&isOfferLetter(input as IssueLetterInput)&&[OFFER_POLICY_NOTICE,OFFER_SIGNING_INSTRUCTIONS].includes(p))).map(p=>{
  const text=clean(p);
  return /\b(?:declin(?:e|ed|ing)|decision|refus(?:e|ed))\b.*(?:remuneration|₹|pay)/i.test(text)?'[Review candidate-specific statement.] '+text:text;
 });
 if(source.kind==='letter'){
  const letter=copy as IssueLetterInput;letter.recipientLines=['[Full legal name]'];letter.salutation='Dear [first name],';letter.reference='';
  if(letter.subject)letter.subject=clean(letter.subject);
  if(letter.ndaBodyParagraphs)letter.ndaBodyParagraphs=letter.ndaBodyParagraphs.map(clean);
 }else{
  const cert=copy as IssueCredentialInput;cert.recipientName='[Full legal name]';
  if(cert.closingLine)cert.closingLine=clean(cert.closingLine);
 }
 const next:DocumentDraft={id:randomUUID(),kind:source.kind,state:'draft',revision:1,createdAt:Date.now(),updatedAt:Date.now(),
  encryptedInput:deps.secretSealer.sealString(JSON.stringify({input:normalizeLetterPunctuation(copy)}))};
 await repo.create(next);
 await deps.auditLog.append({actor:'admin',action:'document.draft.reused',subject:next.id,requestId,meta:{sourceDraftId:id,sourceRevision:revision}});
 return {...draftSummary(deps,next),input:await getDraftInput(deps,next),newCandidate:true};
}
