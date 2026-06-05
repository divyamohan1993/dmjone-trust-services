/**
 * Test-only helpers: build a real (small) PDF and assemble signing/verifying
 * key material from freshly generated keypairs. Not exported from the package
 * entrypoint — used solely by the vitest suites.
 */

import type { CredentialContent, SigningKeys, VerifyingKeys } from '@dmjone/shared';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { generateMldsaKeypair, generateSelfSignedPadesCert } from './keys.js';

/**
 * A minimal but genuine PDF (the renderer produces something similar). Saved
 * with a classic cross-reference TABLE (useObjectStreams:false) to mirror the
 * Chromium output the hybrid signer's incremental-update placeholder expects.
 */
export async function buildSmallPdf(text = 'dmj.one test certificate'): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([420, 300]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(text, { x: 40, y: 240, size: 18, font });
  page.drawText('Certificate of Internship', { x: 40, y: 200, size: 12, font });
  return doc.save({ useObjectStreams: false });
}

export interface TestKeyMaterial {
  signing: SigningKeys;
  verifying: VerifyingKeys;
  logPublicKey: Uint8Array;
  logSecretKey: Uint8Array;
}

/** Generate a full set of keys: ML-DSA doc key, PAdES cert, and a log key. */
export function makeTestKeys(): TestKeyMaterial {
  const docKey = generateMldsaKeypair();
  const logKey = generateMldsaKeypair();
  const pades = generateSelfSignedPadesCert({ notBefore: new Date('2026-06-05T00:00:00Z') });

  const signing: SigningKeys = {
    padesCertPem: pades.certPem,
    padesKeyPem: pades.keyPem,
    mldsaPublicKey: docKey.publicKey,
    mldsaSecretKey: docKey.secretKey,
    mldsaPublicKeyId: docKey.publicKeyId,
  };
  const verifying: VerifyingKeys = {
    mldsaPublicKey: docKey.publicKey,
    mldsaPublicKeyId: docKey.publicKeyId,
    logMldsaPublicKey: logKey.publicKey,
    padesCertPem: pades.certPem,
  };
  return { signing, verifying, logPublicKey: logKey.publicKey, logSecretKey: logKey.secretKey };
}

/** A representative credential content object for round-trip tests. */
export function sampleContent(overrides: Partial<CredentialContent> = {}): CredentialContent {
  return {
    credentialId: 'DMJ-IC-20260605-01',
    type: 'internship',
    issueDate: '2026-06-05',
    kicker: 'Certificate of',
    title: 'INTERNSHIP',
    intro: 'This is to certify that',
    recipientName: 'Asha Verma',
    bodyParagraphs: [
      'has successfully completed a software engineering internship at dmj.one.',
      'demonstrating diligence, skill, and integrity throughout the engagement.',
    ],
    closingLine: 'Issued in good faith.',
    signatory: { name: 'Divya Mohan', role: 'Founder · dmj.one', phone: '+91 79799 30293' },
    ...overrides,
  };
}
