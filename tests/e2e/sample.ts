/**
 * Generate a real, signed sample certificate + its §63 certificate-of-authenticity
 * to `samples/`, so the output can be opened and compared to the reference.
 *
 *   pnpm --filter @dmjone/e2e exec tsx sample.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import {
  createHybridSigner,
  generateMldsaKeypair,
  generateSelfSignedPadesCert,
} from '@dmjone/crypto';
import { createCertificateRenderer, createSection63Generator } from '@dmjone/render';
import {
  DEFAULT_SIGNATORY,
  type CredentialContent,
  type CredentialRecord,
  type SigningKeys,
} from '@dmjone/shared';

const content: CredentialContent = {
  credentialId: 'DMJ-IC-20260604-01',
  type: 'internship',
  issueDate: '2026-06-04',
  kicker: 'Certificate of',
  title: 'INTERNSHIP',
  intro: 'This is to certify that',
  recipientName: 'Rijul Chaudhary',
  bodyParagraphs: [
    'worked with **dmj.one** as a **Content Writer** from **June 2024** to **July 2024**.',
    'During this time he wrote several articles for our Cloud Computing section and helped us improve the way that content reached readers. He was dependable, took feedback well, and put real care into his work.',
    'We were glad to have him on the team, and he carried himself professionally throughout. This certificate is issued at his request, for employment verification and his own records.',
  ],
  closingLine: 'We wish him all the best in everything that lies ahead.',
  signatory: { ...DEFAULT_SIGNATORY },
};

const cred = generateMldsaKeypair();
const pades = generateSelfSignedPadesCert();
const signingKeys: SigningKeys = {
  padesCertPem: pades.certPem,
  padesKeyPem: pades.keyPem,
  mldsaPublicKey: cred.publicKey,
  mldsaSecretKey: cred.secretKey,
  mldsaPublicKeyId: cred.publicKeyId,
};

const renderer = createCertificateRenderer();
const section63 = createSection63Generator();
const signer = createHybridSigner(signingKeys);

const unsigned = await renderer.render(content, {
  qrUrl: `https://verify.dmj.one/c/${content.credentialId}`,
});
const sig = await signer.sign(unsigned, content);

const record: CredentialRecord = {
  id: content.credentialId,
  content,
  status: 'valid',
  createdAt: '2026-06-04T10:00:00.000Z',
  pdfSha256: sig.pdfSha256,
  canonicalPayload: sig.canonicalPayload,
  canonicalSha256: sig.canonicalSha256,
  mldsaSignature: sig.mldsaSignature,
  mldsaPublicKeyId: sig.mldsaPublicKeyId,
  padesCertFingerprint: sig.padesCertFingerprint,
  logSeq: 1,
  logLeafHash: sig.canonicalSha256,
  passwordHash: '(sample)',
  section63: section63.metadata(content, sig.pdfSha256),
};
const s63 = await section63.generate(record);

mkdirSync('../../samples', { recursive: true });
writeFileSync('../../samples/certificate-signed.pdf', sig.signedPdf);
writeFileSync('../../samples/section63.pdf', s63);

process.stdout.write(
  `samples/certificate-signed.pdf  ${(sig.signedPdf.byteLength / 1024).toFixed(0)} KB\n` +
    `samples/section63.pdf           ${(s63.byteLength / 1024).toFixed(0)} KB\n` +
    `pdfSha256 ${sig.pdfSha256}\n`,
);
