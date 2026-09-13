import type {IssueLetterInput} from './schemas.js';
export const TERMS_URL='https://dmj.one/tos';
export const PRIVACY_URL='https://dmj.one/privacy';
export const ENROLLMENT_URL='https://timesheet.dmj.one';
export const OFFER_SIGNING_INSTRUCTIONS='Before beginning, sign this offer letter and its enclosed non-disclosure agreement (NDA), email both signed documents to contact@dmj.one, then enroll at https://timesheet.dmj.one and await written start confirmation from dmj.one before beginning.';
export const OFFER_POLICY_NOTICE='This engagement and use of dmj.one services are also governed by the Terms & Conditions at https://dmj.one/tos and Privacy Policy at https://dmj.one/privacy, subject to applicable law and statutory rights.';
export const DEFAULT_NDA_PARAGRAPHS:readonly string[]=[
 '**1. Parties and purpose.** This agreement is between Divya Mohan, acting through dmj.one, an independent educational initiative, and the recipient identified above. Access to confidential information is provided solely for the learning, development and project work described in the accompanying offer.',
 '**2. Confidential information.** This includes non-public source code, designs, project plans, operational information, security findings, credentials, personal data, and information entrusted to dmj.one by others, where marked confidential or reasonably understood to be confidential. It covers prior and future project disclosures from the date this NDA is signed. It excludes information the recipient can demonstrate was already lawfully known independently of this engagement, independently developed without using confidential information, lawfully obtained without a confidentiality restriction, or publicly available without a breach.',
 '**3. Use and protection.** Use confidential information only for the agreed work. Take reasonable security precautions, restrict access to authorised people who need it, and do not disclose, publish or transfer it without prior written permission. Do not put credentials, personal data or confidential material into public repositories or external AI tools without written approval. Understand and verify any AI-assisted work.',
 '**4. Incidents and required disclosures.** Report suspected loss, unauthorised access or disclosure promptly to contact@dmj.one and cooperate with reasonable containment steps. If disclosure is required by law or a competent authority, disclose only what is required and notify dmj.one beforehand where legally permitted. Nothing here prevents lawful reporting, protected disclosures or the exercise of statutory rights.',
 '**5. Return and deletion.** On request or when the engagement ends, return or securely delete confidential material and access credentials, and confirm completion when asked. Copies that must lawfully be retained, or remain in inaccessible routine backups, must stay protected and must not be used for another purpose.',
 '**6. Ownership and learning.** Confidential information remains with its lawful owner. This NDA does not itself transfer intellectual-property ownership or grant rights beyond the agreed work. The recipient may use general skills, experience and independently developed knowledge, while protecting confidential material and third-party rights. Portfolio publication of project material requires prior written approval.',
 '**7. Duration.** These confidentiality obligations apply during the engagement and for three years after it ends. Trade secrets and personal data remain subject to any longer protection required by applicable law. This agreement does not prohibit future work or study.',
 '**8. Related terms and privacy.** The dmj.one Terms & Conditions at https://dmj.one/tos and Privacy Policy at https://dmj.one/privacy also apply. This NDA specifically governs confidential project information exchanged for the assigned work; that information is not an unsolicited public suggestion. Read these documents together. Mandatory law and statutory rights prevail, and any inconsistency should be raised with contact@dmj.one before signing.',
 '**9. Acceptance and onboarding.** Read this NDA and the accompanying offer, sign both, and email the signed copies to contact@dmj.one. Then enroll at https://timesheet.dmj.one and await written start confirmation from dmj.one before beginning. This NDA takes effect when signed by the recipient; any later changes to its specific obligations require written agreement, subject to applicable law.',
];
export function isOfferLetter(input:{subject?:string|undefined;offerLetter?:boolean|undefined}):boolean{
 return input.offerLetter===true || /\boffer\b/i.test(input.subject??'');
}
export function ndaEnclosureLine(id:string,sha256:string):string{return `Enclosure: Non-disclosure agreement ${id}. SHA-256: ${sha256}.`;}
export function buildNdaInput(offer:Omit<IssueLetterInput,'attestation'|'password'> & {password?:string}):IssueLetterInput{
 const terms=[...(offer.ndaBodyParagraphs??DEFAULT_NDA_PARAGRAPHS)];
 if(!terms.some(p=>p.includes(TERMS_URL)&&p.includes(PRIVACY_URL)))terms.push(OFFER_POLICY_NOTICE);
 return {issueDate:offer.issueDate,reference:'Confidentiality and onboarding',recipientLines:offer.recipientLines.filter((line,index)=>index===0 || /^(?:Date of birth:|Aadhaar \(masked\):|PAN \(masked\):)/i.test(line)),subject:'Non-disclosure agreement',
  salutation:'Please read and sign this agreement.',bodyParagraphs:terms,
  password:offer.password??'preview-only-not-a-download-password',attestation:true};
}

/** House typography for newly prepared correspondence. Historical signed records remain unchanged. */
export function normalizeLetterPunctuation<T>(value:T):T{
 if(typeof value==='string')return value.replace(/\s*—\s*/g,' - ').replace(/₹\s*/g,'INR ') as T;
 if(Array.isArray(value))return value.map(v=>normalizeLetterPunctuation(v)) as T;
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,['password','recipientEmail','emailSendAt'].includes(key)?v:normalizeLetterPunctuation(v)])) as T;
 return value;
}
