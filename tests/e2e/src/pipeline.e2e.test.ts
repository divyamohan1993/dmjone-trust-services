/**
 * End-to-end proof that the five independently-built streams compose into a
 * working trust system. Uses REAL crypto + REAL Chromium rendering + the REAL
 * verify service, over the in-memory data layer. No mocks in the trust path.
 *
 * Our issued documents carry NO embedded digital signature (no PAdES/PKCS#7):
 * authenticity is the DETACHED ML-DSA-87 signature over the canonical record +
 * the transparency log + the validation-ID QR. The PDF is delivered exactly as
 * rendered, so upload-verify is a pure file-hash match.
 *
 *   issue (render → hybrid-sign → log → store)
 *     → verify-by-id            → VALID + public fields
 *     → password download        → exact delivered bytes
 *     → upload-verify (intact)    → VALID (file hash matches the recorded one)
 *     → upload-verify (1-bit flip)→ TAMPERED
 *     → public credential page    → SSR'd VALID, recipient shown, NO signature image
 *     → wrong password            → generic 403
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { createInMemoryStores } from '@dmjone/data';
import {
  createHybridSigner,
  createLogSigner,
  createLogVerifier,
  createPasswordHasher,
  createSignatureVerifier,
  generateMldsaKeypair,
  generateSelfSignedPadesCert,
} from '@dmjone/crypto';
import { createCertificateRenderer, createSection63Generator } from '@dmjone/render';
import { createVerifyApp } from '@dmjone/verify';
import {
  ARGON2_DEFAULTS,
  computeCanonicalPayload,
  DEFAULT_SIGNATORY,
  GENESIS_HEAD_HASH,
  loadEnv,
  type AppEnv,
  type CredentialContent,
  type CredentialRecord,
  type SigningKeys,
  type VerifyingKeys,
} from '@dmjone/shared';
import type { Hono } from 'hono';

const PASSWORD = 'correct horse battery staple';
const CREDENTIAL_ID = 'DMJ-IC-20260605-01';

// Slow: real Argon2id (~1.3s) + two Chromium renders. Generous ceiling.
const SLOW = 120_000;

interface Issued {
  record: CredentialRecord;
  signedPdf: Uint8Array;
}

let verifyApp: Hono;
let issued: Issued;
let verifyingKeys: VerifyingKeys;
let padesFingerprint: string;

function testEnv(): AppEnv {
  process.env['SERVICE_ROLE'] = 'verify';
  process.env['GCP_PROJECT_ID'] = 'test';
  process.env['ISSUER_PUBLIC_URL'] = 'https://issue.test';
  process.env['VERIFY_PUBLIC_URL'] = 'https://verify.test';
  process.env['SESSION_SECRET'] = 'test-session-secret-of-32-bytes!!';
  return loadEnv();
}

const noopLogger = {
  info() {},
  warn() {},
  error() {},
  debug() {},
} as unknown as Parameters<typeof createVerifyApp>[0]['logger'];

beforeAll(async () => {
  const env = testEnv();
  const stores = createInMemoryStores();

  // ── Keys (what the issuer composition root provisions) ──
  const cred = generateMldsaKeypair();
  const pades = generateSelfSignedPadesCert();
  const log = generateMldsaKeypair();
  padesFingerprint = pades.fingerprint;

  const signingKeys: SigningKeys = {
    padesCertPem: pades.certPem,
    padesKeyPem: pades.keyPem,
    mldsaPublicKey: cred.publicKey,
    mldsaSecretKey: cred.secretKey,
    mldsaPublicKeyId: cred.publicKeyId,
  };
  verifyingKeys = {
    mldsaPublicKey: cred.publicKey,
    mldsaPublicKeyId: cred.publicKeyId,
    logMldsaPublicKey: log.publicKey,
    padesCertPem: pades.certPem,
  };

  const signer = createHybridSigner(signingKeys);
  const logSigner = createLogSigner(log.secretKey);
  const renderer = createCertificateRenderer();
  const section63 = createSection63Generator();
  const hasherParams = {
    memoryKiB: ARGON2_DEFAULTS.memoryKiB,
    iterations: ARGON2_DEFAULTS.iterations,
    parallelism: ARGON2_DEFAULTS.parallelism,
  };
  const passwordHasher = createPasswordHasher(hasherParams);

  // ── ISSUE: the issuer pipeline, run directly (no HTTP/auth) ──
  const content: CredentialContent = {
    credentialId: CREDENTIAL_ID,
    type: 'internship',
    issueDate: '2026-06-05',
    kicker: 'Certificate of',
    title: 'INTERNSHIP',
    intro: 'This is to certify that',
    recipientName: 'Aarav Sharma',
    bodyParagraphs: [
      'worked with **dmj.one** as a **Software Engineering Intern** from January 2026 to May 2026.',
      'During this time they contributed to a quantum-verifiable credentialing system and carried themselves with diligence and care.',
    ],
    closingLine: 'We wish them all the best in everything that lies ahead.',
    signatory: { ...DEFAULT_SIGNATORY },
  };

  const unsignedPdf = await renderer.render(content, {
    qrUrl: `${env.VERIFY_PUBLIC_URL}/c/${CREDENTIAL_ID}`,
  });
  const sig = await signer.sign(unsignedPdf, (h) => computeCanonicalPayload(content, h));

  // transparency log append (issuer's retry loop, single-threaded here)
  const prev = await stores.log.getHead();
  const seq = (prev?.seq ?? 0) + 1;
  const leafHash = logSigner.computeLeafHash(sig.canonicalSha256);
  const prevHeadHash = prev?.headHash ?? GENESIS_HEAD_HASH;
  const headHash = logSigner.computeHeadHash(leafHash, prevHeadHash);
  const ts = new Date().toISOString();
  await stores.log.appendLeaf(
    { seq, leafHash, credentialId: CREDENTIAL_ID, canonicalSha256: sig.canonicalSha256, timestamp: ts },
    { seq, headHash, prevHeadHash, signature: logSigner.signHead(headHash), signedAt: ts },
  );

  const record: CredentialRecord = {
    id: CREDENTIAL_ID,
    content,
    status: 'valid',
    createdAt: ts,
    pdfSha256: sig.pdfSha256,
    canonicalPayload: sig.canonicalPayload,
    canonicalSha256: sig.canonicalSha256,
    mldsaSignature: sig.mldsaSignature,
    mldsaPublicKeyId: sig.mldsaPublicKeyId,
    padesCertFingerprint: sig.padesCertFingerprint,
    logSeq: seq,
    logLeafHash: leafHash,
    passwordHash: await passwordHasher.hash(PASSWORD),
    section63: section63.metadata(content, sig.pdfSha256),
  };

  const s63pdf = await section63.generate(record);
  await stores.credentials.create(record);
  await stores.blobs.put(CREDENTIAL_ID, 'certificate', sig.signedPdf);
  await stores.blobs.put(CREDENTIAL_ID, 'section63', s63pdf);

  issued = { record, signedPdf: sig.signedPdf };

  // ── The REAL verify service over the same stores ──
  verifyApp = createVerifyApp({
    env,
    logger: noopLogger,
    credentialRepo: stores.credentials,
    blobStore: stores.blobs,
    logRepo: stores.log,
    anchorRepo: stores.anchors,
    auditLog: stores.audit,
    verifier: createSignatureVerifier(verifyingKeys),
    logVerifier: createLogVerifier(verifyingKeys.logMldsaPublicKey),
    passwordHasher,
    trustedPadesCertFingerprint: padesFingerprint,
  }) as unknown as Hono;
}, SLOW);

describe('issue → verify → download → tamper', () => {
  it('renders a real A4 PDF, delivered as-is with no embedded signature', () => {
    expect(Buffer.from(issued.signedPdf.subarray(0, 5)).toString()).toBe('%PDF-');
    expect(issued.signedPdf.byteLength).toBeGreaterThan(20_000);
    // No PAdES/PKCS#7 dictionary in the document we hand to recipients.
    expect(Buffer.from(issued.signedPdf).toString('latin1')).not.toContain('/ByteRange');
  });

  it('crypto: ML-DSA verifies; the issued doc carries NO embedded PAdES', async () => {
    const verifier = createSignatureVerifier(verifyingKeys);
    expect(
      verifier.verifyMldsa(issued.record.content, issued.record.pdfSha256, issued.record.mldsaSignature),
    ).toBe(true);

    // The record carries no signer-cert fingerprint (there is no embedded cert).
    expect(issued.record.padesCertFingerprint).toBe('');

    // And the delivered PDF has no PKCS#7 signature for the verifier to find.
    const pades = await verifier.verifyPdfPades(issued.signedPdf);
    expect(pades.present).toBe(false);
    expect(pades.intact).toBe(false);
  });

  it('verify-by-id → VALID with public fields', async () => {
    const res = await verifyApp.request(`/api/verify/${CREDENTIAL_ID}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      outcome: string;
      checks: Record<string, boolean>;
      publicFields?: { recipientName: string };
    };
    expect(body.outcome).toBe('valid');
    expect(body.checks.mldsaSignature).toBe(true);
    expect(body.checks.logInclusion).toBe(true);
    expect(body.publicFields?.recipientName).toBe('Aarav Sharma');
  });

  it('password download → exact signed bytes', async () => {
    const res = await verifyApp.request('/api/download', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credentialId: CREDENTIAL_ID, password: PASSWORD }),
    });
    expect(res.status).toBe(200);
    const got = new Uint8Array(await res.arrayBuffer());
    expect(got.byteLength).toBe(issued.signedPdf.byteLength);
    expect(Buffer.from(got).equals(Buffer.from(issued.signedPdf))).toBe(true);
  });

  it('wrong password → generic 403, no bytes', async () => {
    const res = await verifyApp.request('/api/download', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credentialId: CREDENTIAL_ID, password: 'wrong' }),
    });
    expect(res.status).toBe(403);
  });

  it('upload-verify intact → VALID; one flipped bit → TAMPERED', async () => {
    const intact = await postFile(verifyApp, CREDENTIAL_ID, issued.signedPdf);
    expect(intact.outcome).toBe('valid');

    const tampered = new Uint8Array(issued.signedPdf);
    const mid = Math.floor(tampered.length / 2);
    tampered[mid] = tampered[mid]! ^ 0x01; // flip exactly one bit
    const res = await postFile(verifyApp, CREDENTIAL_ID, tampered);
    expect(res.outcome).toBe('tampered');
  });

  it('public credential page → SSR VALID, recipient shown, no signature image', async () => {
    const res = await verifyApp.request(`/c/${CREDENTIAL_ID}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Aarav Sharma');
    expect(html.toLowerCase()).toContain('valid');
    // The handwritten signature image must never appear on the public page.
    expect(html).not.toContain('signature.jpg');
  });
});

async function postFile(
  app: Hono,
  credentialId: string,
  bytes: Uint8Array,
): Promise<{ outcome: string }> {
  const form = new FormData();
  form.append('credentialId', credentialId);
  form.append('file', new Blob([bytes], { type: 'application/pdf' }), 'cert.pdf');
  const res = await app.request('/api/verify/file', { method: 'POST', body: form });
  return (await res.json()) as { outcome: string };
}
