/**
 * Document template catalog — the picker's source of truth.
 *
 * Nine starter documents the sole issuer (dmj.one, an independent educational
 * initiative) can issue: certificates and letterhead letters for genuine
 * interns, contributors, and learners. Each entry is DATA ONLY — it pre-fills
 * the EXISTING {@link CredentialContent} / {@link LetterContent} fields; the
 * renderer, signer, and verify path are untouched.
 *
 * Design constraints (see `docs/dmj/specs/2026-06-17-document-template-library-design.md`):
 *  - SHORT and FACTUAL. These documents are valid because they state true facts
 *    about a real association with a REACHABLE issuer and are independently
 *    verifiable — not because of legalese. So: no statutes, no disclaimers, no
 *    self-description as a registered/recognised body.
 *  - `[slots]` (single brackets) mark the specifics the issuer fills in for each
 *    recipient. The literal `[auto]` token is where the server substitutes the
 *    allocated document number (the issuer never types the number). Both are
 *    stripped by {@link findUnfilledSlot}; any OTHER leftover `[` blocks issuance.
 *  - A paragraph may begin with a leading `[[align:left|center|right|justify]]`
 *    directive (consumed by the renderer); the default is justified body text.
 *  - Every scanned text field is clean against {@link findDenylistedTerm} — the
 *    build-time catalog lint (`doc-templates.test.ts`) is the guard. Internship
 *    documents are additionally free of employment/payment language (an
 *    internship is not employment).
 *  - The verification footer is system-printed on the certificate face and the
 *    letter foot; bodies carry NO verify URL or id.
 *
 * Provenance: #2 (internship completion certificate) and #9 (association
 * verification letter) are directly sourced and ship without a suffix. The
 * other seven are convention-extended and carry a "(lawyer-review)" suffix in
 * the picker label until their wording is reviewed — honestly surfaced, not a
 * hard issuance block (the sole owner attests at issue-time).
 */

import type { CredentialType, DocumentKind } from './types.js';

export interface DocTemplate {
  /** Stable kebab id, e.g. `internship-completion-cert`. */
  id: string;
  /** Picker label; convention-extended types end with " (lawyer-review)". */
  label: string;
  /** Discriminator — exactly one of {@link cert} / {@link letter} is set to match. */
  kind: DocumentKind;
  /** Certificate-face content (set iff `kind === 'certificate'`). */
  cert?: {
    type: CredentialType;
    kicker: string;
    title: string;
    intro: string;
    bodyParagraphs: string[];
    closingLine?: string;
  };
  /** Letterhead-letter content (set iff `kind === 'letter'`). */
  letter?: {
    reference?: string;
    recipientLines: string[];
    subject?: string;
    salutation?: string;
    bodyParagraphs: string[];
    valediction?: string;
  };
}

/** Suffix appended to convention-extended (not directly-sourced) labels. */
const LR = ' (lawyer-review)';

export const DOC_TEMPLATES: readonly DocTemplate[] = [
  // ── 1 · Internship offer letter (forward-looking; internship group) ──────────
  // No compensation language: an internship is not employment, and "stipend" is
  // denylisted for this group (the issuer cannot add pay back at issue-time).
  {
    id: 'internship-offer-letter',
    label: 'Internship offer letter' + LR,
    kind: 'letter',
    letter: {
      reference: 'Ref: [auto]',
      recipientLines: ['[Full legal name]', '[City]'],
      subject: 'Offer of internship at dmj.one',
      salutation: 'Dear [first name],',
      bodyParagraphs: [
        'We are pleased to offer you an internship as a [role / title] with dmj.one, an independent educational initiative. The internship runs from [start date] to [end date].',
        'During this time you will work on [brief factual scope of work], with guidance and mentorship from the dmj.one team. This is a learning internship, not a job offer.',
        'Please confirm your acceptance by [reply-by date]. We look forward to working with you.',
      ],
      valediction: 'Sincerely,',
    },
  },

  // ── 2 · Internship completion / experience certificate (DIRECTLY SOURCED) ────
  // Modelled on the reference internship certificate; the gold standard for tone.
  {
    id: 'internship-completion-cert',
    label: 'Internship completion / experience certificate',
    kind: 'certificate',
    cert: {
      type: 'internship',
      kicker: 'Certificate of',
      title: 'Internship',
      intro: 'This is to certify that',
      bodyParagraphs: [
        'has completed an internship as a [role / title] with dmj.one, an independent educational initiative, from [start date] to [end date].',
        'During the internship, the work covered [brief factual scope of work], and contributed to [key deliverable]. Conduct and technical ability were of a consistently high standard, and the goals set for the internship were met.',
      ],
      closingLine: 'We wish you continued success in all your future endeavours.',
    },
  },

  // ── 3 · Internship letter of recommendation (internship group) ───────────────
  {
    id: 'internship-recommendation-letter',
    label: 'Internship letter of recommendation' + LR,
    kind: 'letter',
    letter: {
      reference: 'Ref: [auto]',
      recipientLines: ['To whom it may concern'],
      subject: 'Letter of recommendation for [Full legal name]',
      salutation: 'Dear Sir / Madam,',
      bodyParagraphs: [
        'I am glad to recommend [Full legal name], who interned as a [role / title] with dmj.one, an independent educational initiative, from [start date] to [end date].',
        'During the internship, [first name] worked on [brief factual scope of work] and delivered [key deliverable]. The work was thorough, the approach was diligent, and progress was made independently once the goals were clear.',
        'I am confident [first name] will bring the same care and ability to future work, and I recommend [him / her / them] without reservation.',
      ],
      valediction: 'Sincerely,',
    },
  },

  // ── 4 · Project / OSS contributor experience certificate ─────────────────────
  {
    id: 'contributor-experience-cert',
    label: 'Project / open-source contributor certificate' + LR,
    kind: 'certificate',
    cert: {
      type: 'experience',
      kicker: 'Certificate of',
      title: 'Contribution',
      intro: 'This is to certify that',
      bodyParagraphs: [
        'contributed to [project / repository name], an open-source project of dmj.one, an independent educational initiative, between [start date] and [end date].',
        'The contributions covered [brief factual scope of work] and included [key deliverable]. The work was reviewed and merged, and it added real value to the project.',
      ],
      closingLine: 'We thank you for your contribution and wish you well ahead.',
    },
  },

  // ── 5 · Contributor letter of recommendation ─────────────────────────────────
  {
    id: 'contributor-recommendation-letter',
    label: 'Contributor letter of recommendation' + LR,
    kind: 'letter',
    letter: {
      reference: 'Ref: [auto]',
      recipientLines: ['To whom it may concern'],
      subject: 'Letter of recommendation for [Full legal name]',
      salutation: 'Dear Sir / Madam,',
      bodyParagraphs: [
        'I am happy to recommend [Full legal name], who contributed to [project / repository name], an open-source project of dmj.one, an independent educational initiative, from [start date] to [end date].',
        '[first name] worked on [brief factual scope of work] and delivered [key deliverable]. The contributions were of good quality, well documented, and made collaboratively with the rest of the team.',
        'I recommend [him / her / them] for any role that values self-driven, dependable engineering work.',
      ],
      valediction: 'Sincerely,',
    },
  },

  // ── 6 · Course / training completion certificate ─────────────────────────────
  // "programme offered by dmj.one" — never "at our institute" ("institute" is denylisted).
  {
    id: 'course-completion-cert',
    label: 'Course / training completion certificate' + LR,
    kind: 'certificate',
    cert: {
      type: 'completion',
      kicker: 'Certificate of',
      title: 'Completion',
      intro: 'This is to certify that',
      bodyParagraphs: [
        'has successfully completed [course / programme name], a learning programme offered by dmj.one, an independent educational initiative, from [start date] to [end date].',
        'The programme covered [brief factual scope of topics], and the requirements for completion were met in full.',
      ],
      closingLine: 'We wish you the very best in applying what you have learned.',
    },
  },

  // ── 7 · Participation certificate ────────────────────────────────────────────
  {
    id: 'participation-cert',
    label: 'Participation certificate' + LR,
    kind: 'certificate',
    cert: {
      type: 'participation',
      kicker: 'Certificate of',
      title: 'Participation',
      intro: 'This is to certify that',
      bodyParagraphs: [
        'participated in [event / programme name], organised by dmj.one, an independent educational initiative, on [date].',
        'The participation covered [brief factual scope of activity], and was active and engaged throughout.',
      ],
      closingLine: 'Thank you for taking part.',
    },
  },

  // ── 8 · Appreciation certificate ─────────────────────────────────────────────
  // "in recognition of" is fine — only "recognized"/"recognised" are denylisted.
  {
    id: 'appreciation-cert',
    label: 'Appreciation certificate' + LR,
    kind: 'certificate',
    cert: {
      type: 'appreciation',
      kicker: 'Certificate of',
      title: 'Appreciation',
      intro: 'This is presented to',
      bodyParagraphs: [
        'in appreciation of [brief factual contribution] to [event / programme name], organised by dmj.one, an independent educational initiative, in [month, year].',
        'Your effort and commitment made a real difference, and we are grateful for it.',
      ],
      closingLine: 'With sincere thanks and appreciation.',
    },
  },

  // ── 9 · Association-verification letter (DIRECTLY SOURCED) ────────────────────
  // "associated with" — never "affiliated" ("affiliated" is denylisted).
  {
    id: 'association-verification-letter',
    label: 'Association-verification letter',
    kind: 'letter',
    letter: {
      reference: 'Ref: [auto]',
      recipientLines: ['To whom it may concern'],
      subject: 'Verification of association with dmj.one',
      salutation: 'Dear Sir / Madam,',
      bodyParagraphs: [
        'This letter confirms that [Full legal name] was associated with dmj.one, an independent educational initiative, as a [role / title] from [start date] to [end date].',
        'During this period, the association involved [brief factual scope of work]. The details stated above are accurate to our records.',
        'This letter is issued on request for the purpose of verification. For any clarification, the contact details of the issuer are printed below.',
      ],
      valediction: 'Sincerely,',
    },
  },
];
