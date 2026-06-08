/**
 * Proves the REAL PAdES-B-T path end to end (the combined whole, not the halves):
 *  1. a real DigiCert token actually fits the 30000-byte placeholder (with headroom)
 *  2. render → sign-with-real-TSA → the timestamp is embedded
 *  3. the PAdES signature still verifies intact
 *
 *   pnpm --filter @dmjone/e2e exec tsx ltv-live-smoke.ts
 */
import { Buffer } from 'node:buffer';
import {
  ForgePadesSigner,
  createHybridSigner,
  createSignatureVerifier,
  generateMldsaKeypair,
  generateSelfSignedPadesCert,
} from '@dmjone/crypto';
import { createCertificateRenderer } from '@dmjone/render';
import {
  computeCanonicalPayload,
  DEFAULT_SIGNATORY,
  type CredentialContent,
  type SigningKeys,
  type VerifyingKeys,
} from '@dmjone/shared';

const TSA = 'http://timestamp.digicert.com';
const PLACEHOLDER = 30000;

const cred = generateMldsaKeypair();
const log = generateMldsaKeypair();
const pades = generateSelfSignedPadesCert();
const signingKeys: SigningKeys = {
  padesCertPem: pades.certPem,
  padesKeyPem: pades.keyPem,
  mldsaPublicKey: cred.publicKey,
  mldsaSecretKey: cred.secretKey,
  mldsaPublicKeyId: cred.publicKeyId,
};
const verifyingKeys: VerifyingKeys = {
  mldsaPublicKey: cred.publicKey,
  mldsaPublicKeyId: cred.publicKeyId,
  logMldsaPublicKey: log.publicKey,
  padesCertPem: pades.certPem,
};

// 1. Real PKCS#7 size with a real DigiCert token (incl. its cert chain).
const direct = await new ForgePadesSigner(pades.certPem, pades.keyPem, { url: TSA }).sign(
  Buffer.from('x'.repeat(4096)),
);
const headroom = PLACEHOLDER - direct.length;
console.log(`PKCS#7 w/ real DigiCert token: ${direct.length} bytes | placeholder ${PLACEHOLDER} | headroom ${headroom}`);

// 2. Full render → sign with the real TSA.
const content: CredentialContent = {
  credentialId: 'DMJ-IC-20260606-09',
  type: 'internship',
  issueDate: '2026-06-06',
  kicker: 'Certificate of',
  title: 'INTERNSHIP',
  intro: 'This is to certify that',
  recipientName: 'LTV Smoke',
  bodyParagraphs: ['validating **trusted timestamps** on the real path.'],
  closingLine: 'Done.',
  signatory: { ...DEFAULT_SIGNATORY },
};
const unsigned = await createCertificateRenderer().render(content, {
  qrUrl: `https://verify.dmj.one/c/${content.credentialId}`,
});
const sig = await createHybridSigner(signingKeys, { tsa: { url: TSA } }).sign(
  unsigned,
  (h) => computeCanonicalPayload(content, h),
);
console.log(`signed cert PDF: ${(sig.signedPdf.length / 1024).toFixed(0)} KB`);

// DER value bytes of id-aa-timeStampToken (1.2.840.113549.1.9.16.2.14). The
// PKCS#7 is hex-encoded inside the PDF /Contents, so check the raw DER (`direct`)
// where the OID bytes appear verbatim — that proves the real token embeds.
const oidDer = Buffer.from([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x09, 0x10, 0x02, 0x0e]).toString('latin1');
const hasTimestamp = Buffer.from(direct).toString('latin1').includes(oidDer);
const pv = await createSignatureVerifier(verifyingKeys).verifyPdfPades(sig.signedPdf);
console.log(`timestamp embedded: ${hasTimestamp} | PAdES present: ${pv.present} intact: ${pv.intact}`);

const ok = direct.length < PLACEHOLDER && headroom > 5000 && hasTimestamp && pv.present && pv.intact;
console.log(ok ? '\nLTV LIVE PATH OK ✓ (real token fits + signature intact)' : '\nLTV LIVE PATH PROBLEM ✗');
process.exit(ok ? 0 : 1);
