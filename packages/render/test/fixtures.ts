/**
 * Shared test fixtures: a realistic credential modelled on the reference
 * `assets/Rijul_Chaudhary_Internship_Certificate.pdf`, kept short enough to
 * stay one A4 page in the integration render.
 */

import type { CredentialContent, CredentialRecord, Section63Metadata } from '@dmjone/shared';

export const SAMPLE_CONTENT: CredentialContent = {
  credentialId: 'DMJ-IC-20260604-01',
  type: 'internship',
  issueDate: '2026-06-04',
  kicker: 'Certificate of',
  title: 'Internship',
  intro: 'This is to certify that',
  recipientName: 'Rijul Chaudhary',
  bodyParagraphs: [
    'has successfully completed a software engineering internship with dmj.one, contributing to the design and development of secure, accessible web applications.',
    'Throughout the engagement, conduct and technical ability were consistently of a high standard, and the work delivered met the goals set for the internship.',
  ],
  closingLine: 'We wish you continued success in all your future endeavours.',
  signatory: {
    name: 'Divya Mohan',
    role: 'Founder · dmj.one',
    phone: '+91 79799 30293',
  },
};

export const SAMPLE_SECTION63: Section63Metadata = {
  hashValue: 'a'.repeat(64),
  hashAlgorithm: 'SHA-256',
  producedBy: 'dmj.one Trust Services (Google Cloud Run, asia-east1)',
  productionMethod: 'render to PDF, embed PAdES, detached ML-DSA-65 over SHA-256 of the signed PDF',
  deviceParticulars: 'Cloud Run Linux container, headless Chromium, Node.js signer',
  generatedAt: '2026-06-04T10:15:00.000Z',
};

export const SAMPLE_RECORD: CredentialRecord = {
  id: SAMPLE_CONTENT.credentialId,
  content: SAMPLE_CONTENT,
  status: 'valid',
  createdAt: '2026-06-04T10:15:00.000Z',
  pdfSha256: 'a'.repeat(64),
  canonicalPayload: '{"credentialId":"DMJ-IC-20260604-01"}',
  canonicalSha256: 'b'.repeat(64),
  mldsaSignature: 'AA==',
  mldsaPublicKeyId: 'mldsa-v1',
  padesCertFingerprint: 'c'.repeat(64),
  logSeq: 1,
  logLeafHash: 'd'.repeat(64),
  passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$xxxx$yyyy',
  section63: SAMPLE_SECTION63,
};

/** A hostile-input variant: every escapable character in user-controlled fields. */
export const XSS_CONTENT: CredentialContent = {
  ...SAMPLE_CONTENT,
  recipientName: 'A & B <script>alert(1)</script> "Q" \'R\'',
  title: 'Title <b>bold</b> & more',
  kicker: 'Kicker & <i>x</i>',
  intro: 'Intro <em>y</em> & "z"',
  bodyParagraphs: ['Body & <strong>danger</strong> paragraph <img src=x onerror=1>'],
  closingLine: 'Closing & <u>line</u>',
  signatory: {
    name: 'Sig & <b>Name</b>',
    role: 'Role & <i>R</i>',
    phone: '+91 <00000>',
  },
};
