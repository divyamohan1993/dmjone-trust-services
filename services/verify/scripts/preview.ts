/**
 * Visual-preview server for the verify portal: the REAL app factory wired to
 * the in-memory test fakes, seeded with one record per state, so the cinematic
 * experience can be driven in a browser (and by Playwright) with zero infra.
 *
 *   pnpm --filter @dmjone/verify preview          → http://localhost:8787
 *
 * Seeded tour:
 *   /                          the landing ("Is it genuine?")
 *   /c/DMJ-IC-20260604-01      VALID certificate (+ RFC-3161 Clock world, anchored)
 *   /c/DMJ-IC-20260604-02      REVOKED certificate
 *   /c/DMJ-LTR-20260604-01     valid letter (anchor pending)
 *   /c/DMJ-DOC-20260604-01     upload (anti-spoof file-gate; anchor pending)
 *   /c/DMJ-IC-29990101-99      the branded not-found page
 *
 * Dev-only: never deployed, no real keys, no real records.
 */

import { serve } from '@hono/node-server';
import { createVerifyApp, type VerifyDeps } from '../src/app.js';
import {
  FakeAnchorRepository,
  FakeAuditLog,
  FakeBlobStore,
  FakeCredentialRepository,
  FakeLogRepository,
  FakeLogVerifier,
  FakePasswordHasher,
  FakeSignatureVerifier,
  hashHex,
  makeEnv,
  makeLetterRecord,
  makeLogger,
  makeRecord,
  makeUploadRecord,
} from '../test/fakes.js';
import type { CredentialRecord, LogLeaf, SignedTreeHead } from '@dmjone/shared';
import { GENESIS_HEAD_HASH } from '@dmjone/shared';

const logVerifier = new FakeLogVerifier();
const pdfBytes = new TextEncoder().encode('%PDF-1.7\npreview certificate bytes\n%%EOF');
const pdfSha256 = hashHex(pdfBytes);

const validCert = makeRecord({ pdfSha256, tsaTimestampToken: 'preview-tsa-token', logSeq: 1 }); // pragma: allowlist secret
// Distinct id needs the content + record id patched together (makeRecord's
// trailing override spread would otherwise replace the whole content object).
const revokedBase = makeRecord({
  pdfSha256,
  logSeq: 2,
  status: 'revoked',
  revokedAt: '2026-06-05T00:00:00.000Z',
});
const revokedCert: CredentialRecord = {
  ...revokedBase,
  id: 'DMJ-IC-20260604-02',
  content: { ...revokedBase.content, credentialId: 'DMJ-IC-20260604-02' },
};
const letter = makeLetterRecord({}, { pdfSha256, logSeq: 3 });
const upload = makeUploadRecord({}, { pdfSha256, logSeq: 4 });
const records: CredentialRecord[] = [validCert, revokedCert, letter, upload];

const credentialRepo = new FakeCredentialRepository(records);
const blobStore = new FakeBlobStore();
const logRepo = new FakeLogRepository();
let prevHead = GENESIS_HEAD_HASH;
let headHash = prevHead;
for (const record of records) {
  const leafHash = logVerifier.computeLeafHash(record.canonicalSha256);
  const leaf: LogLeaf = {
    seq: record.logSeq,
    leafHash,
    credentialId: record.id,
    canonicalSha256: record.canonicalSha256,
    timestamp: record.createdAt,
  };
  logRepo.addLeaf(leaf);
  headHash = logVerifier.computeHeadHash(leafHash, prevHead);
  prevHead = headHash;
  blobStore.set(record.id, 'certificate', pdfBytes);
  blobStore.set(record.id, 'section63', new TextEncoder().encode('%PDF-1.7 preview section63 %%EOF'));
}
const head: SignedTreeHead = {
  seq: records[records.length - 1]!.logSeq,
  headHash,
  prevHeadHash: prevHead,
  signature: 'HEADSIG',
  signedAt: '2026-06-04T10:00:00.000Z',
};
logRepo.setHead(head);

// Anchored through seq 2 → the certificates show "anchored", letter/upload
// show the soft "pending" state; both anchor faces are visitable.
const anchorRepo = new FakeAnchorRepository();
anchorRepo.add({
  headSeq: 2,
  headHash,
  anchoredAt: '2026-06-04T11:00:00.000Z',
  github: {
    repo: 'divyamohan1993/dmjone-trust-anchor',
    commitSha: 'f'.repeat(40),
    url: 'https://github.com/divyamohan1993/dmjone-trust-anchor',
  },
});

const passwordHasher = new FakePasswordHasher();
for (const record of records) passwordHasher.register(record.passwordHash, 'preview-pass');

const deps: VerifyDeps = {
  env: makeEnv() as VerifyDeps['env'],
  logger: makeLogger(),
  credentialRepo,
  blobStore,
  logRepo,
  anchorRepo,
  auditLog: new FakeAuditLog(),
  verifier: new FakeSignatureVerifier(),
  logVerifier,
  passwordHasher,
  trustedPadesCertFingerprint: 'c'.repeat(64),
  evidenceKeys: {
    mldsaPublicKeyBase64: 'TUxEU0EtUFVCTElDLUtFWQ==',
    logMldsaPublicKeyBase64: 'TE9HLVBVQkxJQy1LRVk=',
  },
};

const app = createVerifyApp(deps);
const port = Number(process.env['PREVIEW_PORT'] ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
  // eslint-disable-next-line no-console -- dev preview banner, not app logging
  console.log(`verify preview → http://localhost:${info.port}  (valid: /c/${validCert.id}, revoked: /c/${revokedCert.id}, letter: /c/${letter.id}, upload: /c/${upload.id})`);
});
