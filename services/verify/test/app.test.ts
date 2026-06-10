/**
 * HTTP-surface tests for the verify service. Everything is driven through
 * app.request(...) — no node-server, no sockets — so the suite is fast and
 * deterministic.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { createVerifyApp, type VerifyDeps } from '../src/app.js';
import { CINEMA_JS_HASH } from '../src/cinema.js';
import { FAVICON_PNG_32, FAVICON_PNG_180 } from '../src/favicon.js';
import {
  asJson,
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
  makeLogger,
  makeRecord,
} from './fakes.js';
import type { CredentialRecord, LogLeaf, SignedTreeHead } from '@dmjone/shared';
import { GENESIS_HEAD_HASH } from '@dmjone/shared';

/** A bundle of consistent fakes + the app under test. */
interface Harness {
  app: ReturnType<typeof createVerifyApp>;
  deps: VerifyDeps;
  credentialRepo: FakeCredentialRepository;
  blobStore: FakeBlobStore;
  logRepo: FakeLogRepository;
  anchorRepo: FakeAnchorRepository;
  auditLog: FakeAuditLog;
  verifier: FakeSignatureVerifier;
  logVerifier: FakeLogVerifier;
  passwordHasher: FakePasswordHasher;
  record: CredentialRecord;
  pdfBytes: Uint8Array;
}

/** Build a fully wired, internally consistent harness around one credential. */
function makeHarness(recordOverrides: Partial<CredentialRecord> = {}): Harness {
  const logVerifier = new FakeLogVerifier();

  // The signed PDF whose SHA-256 the record commits to.
  const pdfBytes = new TextEncoder().encode('%PDF-1.7\nfake signed certificate bytes\n%%EOF');
  const pdfSha256 = hashHex(pdfBytes);

  const record = makeRecord({ pdfSha256, ...recordOverrides });

  // A log leaf + head consistent with the verifier's leaf math, so logInclusion passes.
  const leafHash = logVerifier.computeLeafHash(record.canonicalSha256);
  const leaf: LogLeaf = {
    seq: record.logSeq,
    leafHash,
    credentialId: record.id,
    canonicalSha256: record.canonicalSha256,
    timestamp: record.createdAt,
  };
  const head: SignedTreeHead = {
    seq: record.logSeq,
    headHash: logVerifier.computeHeadHash(leafHash, GENESIS_HEAD_HASH),
    prevHeadHash: GENESIS_HEAD_HASH,
    signature: 'HEADSIG',
    signedAt: record.createdAt,
  };

  const credentialRepo = new FakeCredentialRepository([record]);
  const blobStore = new FakeBlobStore();
  blobStore.set(record.id, 'certificate', pdfBytes);
  blobStore.set(record.id, 'section63', new TextEncoder().encode('%PDF-1.7 section63 %%EOF'));

  const logRepo = new FakeLogRepository();
  logRepo.addLeaf(leaf);
  logRepo.setHead(head);

  const anchorRepo = new FakeAnchorRepository();
  const auditLog = new FakeAuditLog();
  const verifier = new FakeSignatureVerifier();
  const passwordHasher = new FakePasswordHasher();
  passwordHasher.register(record.passwordHash, 'correct horse battery');

  const deps: VerifyDeps = {
    env: makeEnv() as VerifyDeps['env'],
    logger: makeLogger(),
    credentialRepo,
    blobStore,
    logRepo,
    anchorRepo,
    auditLog,
    verifier,
    logVerifier,
    passwordHasher,
    // Matches makeRecord().padesCertFingerprint and the fake verifier's default
    // certFingerprint, so the happy path yields padesSignature=true.
    trustedPadesCertFingerprint: 'c'.repeat(64),
    // Public verification keys (base64) the self-contained evidence bundle embeds.
    evidenceKeys: {
      mldsaPublicKeyBase64: 'TUxEU0EtUFVCTElDLUtFWQ==', // "MLDSA-PUBLIC-KEY"
      logMldsaPublicKeyBase64: 'TE9HLVBVQkxJQy1LRVk=', // "LOG-PUBLIC-KEY"
    },
  };

  return {
    app: createVerifyApp(deps),
    deps,
    credentialRepo,
    blobStore,
    logRepo,
    anchorRepo,
    auditLog,
    verifier,
    logVerifier,
    passwordHasher,
    record,
    pdfBytes,
  };
}

const ID = 'DMJ-IC-20260604-01';

describe('landing (bare domain)', () => {
  it('GET / renders the branded landing, not a raw 404', async () => {
    const { app } = makeHarness();
    const res = await app.request('/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type') ?? '').toContain('text/html');
    expect(await res.text()).toContain('Verify a credential');
  });

  it('GET /?id=<valid> redirects to /c/:id', async () => {
    const { app } = makeHarness();
    const res = await app.request(`/?id=${ID}`);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`/c/${ID}`);
  });

  it('GET /?id=<lowercase/padded> normalises and still redirects (no silent bounce)', async () => {
    const { app } = makeHarness();
    const res = await app.request(`/?id=${encodeURIComponent(`  ${ID.toLowerCase()} `)}`);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(`/c/${ID}`);
  });

  it('GET /?id=<invalid> falls back to the landing (no open redirect)', async () => {
    const { app } = makeHarness();
    const res = await app.request('/?id=' + encodeURIComponent('bad id /../'));
    expect(res.status).toBe(200);
  });

  it('GET /?id=<invalid> explains the rejection inline and echoes the id SAFELY', async () => {
    const { app } = makeHarness();
    const res = await app.request('/?id=' + encodeURIComponent('DMJ/2026/<script>alert(1)</script>'));
    expect(res.status).toBe(200);
    const html = await res.text();
    // Never a silent bounce: the visitor is told what a credential ID looks like.
    expect(html).toContain('lp-error');
    expect(html).toMatch(/That doesn&rsquo;t look like a credential ID/);
    expect(html).toContain('DMJ-XX-YYYYMMDD-NN');
    // The echoed value is escaped — no reflected XSS surface.
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('health', () => {
  it('GET /health is shallow OK', async () => {
    const { app } = makeHarness();
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('ok');
  });

  it('GET /health/ready reports readiness', async () => {
    const { app } = makeHarness();
    const res = await app.request('/health/ready');
    expect(res.status).toBe(200);
  });
});

describe('favicons (the real dmj.one logo, served same-origin)', () => {
  it('serves the EXACT icon bytes (a pooled small Buffer once leaked slab memory)', async () => {
    const { app } = makeHarness();
    const expected: Record<string, Buffer> = {
      '/favicon.ico': FAVICON_PNG_32,
      '/favicon-32.png': FAVICON_PNG_32,
      '/apple-touch-icon.png': FAVICON_PNG_180,
    };
    for (const [path, want] of Object.entries(expected)) {
      const res = await app.request(path);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe('image/png');
      const bytes = new Uint8Array(await res.arrayBuffer());
      // PNG magic AND full byte equality with the source: `.slice().buffer` on
      // a pool-allocated Buffer served the WHOLE 8 KiB slab (Hono source text)
      // — a magic-only check passed by pool-offset luck in this process.
      expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
      expect(bytes.byteLength).toBe(want.byteLength);
      expect(Buffer.from(bytes).equals(want)).toBe(true);
    }
  });

  it('is linked from the page head and allowed by CSP (img-src self)', async () => {
    const { app } = makeHarness();
    const res = await app.request(`/c/${ID}`);
    const html = await res.text();
    expect(html).toContain('<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png?v=2">');
    expect(html).toContain('<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=2">');
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("img-src 'self'");
  });
});

describe('the cinema engine asset (GET /assets/cinema-<hash>.js)', () => {
  it('serves the hashed engine immutably with a JS content type', async () => {
    const { app } = makeHarness();
    const res = await app.request(`/assets/cinema-${CINEMA_JS_HASH}.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type') ?? '').toContain('text/javascript');
    expect(res.headers.get('cache-control') ?? '').toContain('immutable');
    const body = await res.text();
    expect(body).toContain('use strict');
  });

  it('rejects any other asset name (the hash IS the allow-list)', async () => {
    const { app } = makeHarness();
    const res = await app.request('/assets/cinema-ffffffffffff.js');
    expect(res.status).toBe(404);
    const res2 = await app.request('/assets/..%2F..%2Fetc%2Fpasswd');
    expect(res2.status).toBe(404);
  });

  it('is exactly the script the credential page references', async () => {
    const { app } = makeHarness();
    const page = await (await app.request(`/c/${ID}`)).text();
    expect(page).toContain(`<script src="/assets/cinema-${CINEMA_JS_HASH}.js" defer></script>`);
  });
});

describe('security headers', () => {
  it('sets defensive headers and a nonce CSP on the HTML page', async () => {
    const { app } = makeHarness();
    const res = await app.request(`/c/${ID}`);
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBeTruthy();
    expect(res.headers.get('strict-transport-security')).toContain('max-age=');
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toMatch(/script-src[^;]*'nonce-/);
    // CSP must NOT weaken script execution with unsafe-inline.
    expect(csp).not.toContain("'unsafe-inline'");
  });
});

describe('GET /api/verify/:credentialId', () => {
  it('returns a valid VerificationResult with public fields for a good credential', async () => {
    const { app } = makeHarness();
    const res = await app.request(`/api/verify/${ID}`);
    expect(res.status).toBe(200);
    const body = await asJson(res);
    expect(body.credentialId).toBe(ID);
    expect(body.outcome).toBe('valid');
    expect(body.checks.mldsaSignature).toBe(true);
    expect(body.checks.hashMatch).toBe(true);
    expect(body.checks.logInclusion).toBe(true);
    expect(body.checks.notRevoked).toBe(true);
    // No PAdES check in the id-lookup flow (needs the file).
    expect(body.checks.padesSignature).toBeUndefined();
    expect(body.publicFields.recipientName).toBe('Aarav Sharma');
    expect(body.publicFields.issuer).toBe('dmj.one Trust Services');
    expect(body.verifiedAt).toBeTruthy();
  });

  it('verifies by id as VALID with NO PAdES check at all (id flow never inspects a PDF)', async () => {
    // The by-id flow has no uploaded bytes to inspect, so it never runs the
    // PAdES check: padesSignature is absent (undefined), and the verdict rests
    // entirely on the detached ML-DSA signature + transparency log + revocation
    // status. A document with no embedded PDF signature is therefore VALID here
    // by construction — there is nothing PAdES-shaped in this path to downgrade.
    const { app } = makeHarness();
    const res = await app.request(`/api/verify/${ID}`);
    const body = await asJson(res);
    expect(body.outcome).toBe('valid');
    expect(body.checks.padesSignature).toBeUndefined();
    expect(body.checks.mldsaSignature).toBe(true);
    expect(body.checks.hashMatch).toBe(true);
    expect(body.checks.logInclusion).toBe(true);
    expect(body.checks.notRevoked).toBe(true);
  });

  it('reports anchorProof=true when a GitHub-published anchor covers the record', async () => {
    // The "External anchor" check is GREEN only when the head was actually
    // published to the public external store, not merely recorded as a bare proof.
    const h = makeHarness();
    h.anchorRepo.add({
      headSeq: h.record.logSeq,
      headHash: 'h'.repeat(64),
      anchoredAt: '2026-06-08T00:00:00.000Z',
      github: {
        repo: 'divyamohan1993/dmjone-trust-anchor',
        commitSha: 'c'.repeat(40),
        url: 'https://github.com/divyamohan1993/dmjone-trust-anchor/blob/main/heads/1.json',
      },
    });
    const res = await h.app.request(`/api/verify/${ID}`);
    const body = await asJson(res);
    expect(body.checks.anchorProof).toBe(true);
    expect(body.outcome).toBe('valid'); // anchorProof is informational; still valid.
  });

  it('reports anchorProof=false (pending) for a BARE proof, never a false green', async () => {
    // A bare proof (no github field) is saved when external publishing is
    // unconfigured or fails. It must NOT make the public "External anchor" check
    // read as anchored — that was the loophole. The verdict stays VALID (soft).
    const h = makeHarness();
    h.anchorRepo.add({
      headSeq: h.record.logSeq,
      headHash: 'h'.repeat(64),
      anchoredAt: '2026-06-08T00:00:00.000Z',
    });
    const res = await h.app.request(`/api/verify/${ID}`);
    const body = await asJson(res);
    expect(body.checks.anchorProof).toBe(false);
    expect(body.outcome).toBe('valid'); // still valid — anchor never gates.
  });

  it('never includes signature material or a download link in the JSON payload', async () => {
    const { app, record } = makeHarness();
    const res = await app.request(`/api/verify/${ID}`);
    const text = await res.text();
    expect(text).not.toContain(record.mldsaSignature);
    expect(text).not.toContain('passwordHash');
    expect(text).not.toContain('signature image');
  });

  it('reports outcome=revoked but still returns public fields', async () => {
    const { app } = makeHarness({ status: 'revoked', revokedAt: '2026-06-05T00:00:00.000Z' });
    const res = await app.request(`/api/verify/${ID}`);
    expect(res.status).toBe(200);
    const body = await asJson(res);
    expect(body.outcome).toBe('revoked');
    expect(body.checks.notRevoked).toBe(false);
    expect(body.publicFields.status).toBe('revoked');
    expect(body.publicFields.recipientName).toBe('Aarav Sharma');
  });

  it('returns outcome=unknown and no public fields for an unknown credential', async () => {
    const { app } = makeHarness();
    const res = await app.request('/api/verify/DMJ-IC-29990101-99');
    expect(res.status).toBe(200);
    const body = await asJson(res);
    expect(body.outcome).toBe('unknown');
    expect(body.publicFields).toBeUndefined();
  });

  it('returns outcome=unknown when the ML-DSA signature fails to verify', async () => {
    const h = makeHarness();
    h.verifier.mldsaValid = false;
    const res = await h.app.request(`/api/verify/${ID}`);
    const body = await asJson(res);
    expect(body.outcome).toBe('unknown');
    expect(body.checks.mldsaSignature).toBe(false);
  });

  it('rejects a malformed credential id with a uniform ApiError', async () => {
    const { app } = makeHarness();
    const res = await app.request('/api/verify/not-a-valid-id');
    expect(res.status).toBe(400);
    const body = await asJson(res);
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.requestId).toBeTruthy();
  });
});

describe('POST /api/verify/file', () => {
  /** Build a multipart form with the credential id + an uploaded file. */
  function form(id: string, bytes: Uint8Array, filename = 'cert.pdf'): FormData {
    const fd = new FormData();
    fd.set('credentialId', id);
    fd.set('file', new Blob([bytes], { type: 'application/pdf' }), filename);
    return fd;
  }

  it('returns valid for the exact signed bytes and includes the PAdES check', async () => {
    const { app, pdfBytes } = makeHarness();
    const res = await app.request('/api/verify/file', { method: 'POST', body: form(ID, pdfBytes) });
    expect(res.status).toBe(200);
    const body = await asJson(res);
    expect(body.outcome).toBe('valid');
    expect(body.checks.hashMatch).toBe(true);
    expect(body.checks.padesSignature).toBe(true);
    expect(body.publicFields.recipientName).toBe('Aarav Sharma');
  });

  it('returns tampered when a single byte is flipped', async () => {
    const { app, pdfBytes } = makeHarness();
    const mutated = Uint8Array.from(pdfBytes);
    mutated[10] = (mutated[10]! ^ 0x01) & 0xff; // flip one bit
    const res = await app.request('/api/verify/file', {
      method: 'POST',
      body: form(ID, mutated),
    });
    expect(res.status).toBe(200);
    const body = await asJson(res);
    expect(body.outcome).toBe('tampered');
    expect(body.checks.hashMatch).toBe(false);
  });

  it('verifies an uploaded file with NO password (employer flow)', async () => {
    // The form carries no password field at all; verification still succeeds.
    const { app, pdfBytes } = makeHarness();
    const fd = form(ID, pdfBytes);
    expect(fd.get('password')).toBeNull();
    const res = await app.request('/api/verify/file', { method: 'POST', body: fd });
    const body = await asJson(res);
    expect(body.outcome).toBe('valid');
  });

  it('returns unknown when the uploaded file matches an unknown id', async () => {
    const { app, pdfBytes } = makeHarness();
    const res = await app.request('/api/verify/file', {
      method: 'POST',
      body: form('DMJ-IC-29990101-99', pdfBytes),
    });
    const body = await asJson(res);
    expect(body.outcome).toBe('unknown');
  });

  it('rejects a request with no file', async () => {
    const { app } = makeHarness();
    const fd = new FormData();
    fd.set('credentialId', ID);
    const res = await app.request('/api/verify/file', { method: 'POST', body: fd });
    expect(res.status).toBe(400);
  });

  it('reports revoked (not valid) for matching bytes of a revoked credential', async () => {
    const { app, pdfBytes } = makeHarness({ status: 'revoked', revokedAt: '2026-06-05T00:00:00.000Z' });
    const res = await app.request('/api/verify/file', { method: 'POST', body: form(ID, pdfBytes) });
    const body = await asJson(res);
    expect(body.outcome).toBe('revoked');
    expect(body.checks.hashMatch).toBe(true);
  });

  it('still reports valid when ML-DSA + hash hold even if the self-signed PAdES is unparseable', async () => {
    // ML-DSA is the authoritative anchor (spec §5); a missing/garbled PAdES
    // object must not, on its own, downgrade a cryptographically valid result.
    const h = makeHarness();
    h.verifier.padesResult = { present: false, intact: false };
    const res = await h.app.request('/api/verify/file', { method: 'POST', body: form(ID, h.pdfBytes) });
    const body = await asJson(res);
    expect(body.outcome).toBe('valid');
    expect(body.checks.padesSignature).toBe(false);
  });

  it('verifies a CLEAN PDF with NO embedded PAdES signature as VALID (the normal case now)', async () => {
    // Our issuer now ships documents with NO embedded PKCS#7/PAdES object (the
    // browser "signature could not be verified" banner scared recipients).
    // Authenticity rests SOLELY on the detached ML-DSA-87 signature over the
    // canonical record + the public transparency log + the validation QR. A
    // file carrying no /ByteRange yields verifyPdfPades → present:false; that is
    // the EXPECTED shape for our own documents and MUST NOT downgrade the
    // verdict. (present:false is the absence of a signature, not a failed one.)
    const h = makeHarness();
    h.verifier.padesResult = { present: false, intact: false };
    const res = await h.app.request('/api/verify/file', { method: 'POST', body: form(ID, h.pdfBytes) });
    const body = await asJson(res);
    expect(body.outcome).toBe('valid');
    // The authoritative checks all hold; the informational PAdES check is simply absent.
    expect(body.checks.mldsaSignature).toBe(true);
    expect(body.checks.hashMatch).toBe(true);
    expect(body.checks.logInclusion).toBe(true);
    expect(body.checks.notRevoked).toBe(true);
    // padesSignature is false (no embedded sig) — informational only, never a gate.
    expect(body.checks.padesSignature).toBe(false);
  });

  it('passes the PAdES check when the embedded cert matches the trusted fingerprint', async () => {
    // Harness wires trustedPadesCertFingerprint = the fake verifier's cert fp.
    const { app, pdfBytes } = makeHarness();
    const res = await app.request('/api/verify/file', { method: 'POST', body: form(ID, pdfBytes) });
    const body = await asJson(res);
    expect(body.checks.padesSignature).toBe(true);
    expect(body.outcome).toBe('valid');
  });

  it('fails the PAdES check for a foreign (intact-but-wrong) signing cert', async () => {
    // The crux: verifyPdfPades reports intact:true for ANY internally consistent
    // signature, including one made by a SWAPPED cert. Pinning the fingerprint is
    // what stops a foreign-but-intact signature from reading as "ours".
    const h = makeHarness();
    h.verifier.padesResult = { present: true, intact: true, certFingerprint: 'f'.repeat(64) };
    const res = await h.app.request('/api/verify/file', { method: 'POST', body: form(ID, h.pdfBytes) });
    const body = await asJson(res);
    expect(body.checks.padesSignature).toBe(false);
    // ML-DSA + hash still hold (bytes unchanged), so the overall verdict is valid.
    expect(body.outcome).toBe('valid');
  });

  it('reports tampered for a swapped-cert file even if PAdES would read intact', async () => {
    // A real cert-swap re-writes the PDF bytes, so hash(uploaded) != pdfSha256.
    // The decisive hash gate must win → 'tampered' — never relying on PAdES.
    const h = makeHarness();
    // Pretend the swapped file still carries an internally-intact (foreign) sig.
    h.verifier.padesResult = { present: true, intact: true, certFingerprint: 'f'.repeat(64) };
    const swapped = Uint8Array.from(h.pdfBytes);
    swapped[5] = (swapped[5]! ^ 0xff) & 0xff; // bytes differ from what we signed
    const res = await h.app.request('/api/verify/file', { method: 'POST', body: form(ID, swapped) });
    const body = await asJson(res);
    expect(body.checks.hashMatch).toBe(false);
    expect(body.outcome).toBe('tampered');
  });
});

describe('POST /api/download', () => {
  it('streams the certificate bytes for the correct password', async () => {
    const { app, pdfBytes } = makeHarness();
    const res = await app.request('/api/download', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credentialId: ID, password: 'correct horse battery' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/pdf');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(buf).toEqual(pdfBytes);
  });

  it('still allows the recipient to download a revoked credential (password = ownership)', async () => {
    const { app } = makeHarness({ status: 'revoked', revokedAt: '2026-06-05T00:00:00.000Z' });
    const res = await app.request('/api/download', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credentialId: ID, password: 'correct horse battery' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/pdf');
  });

  it('audits a successful download', async () => {
    const { app, auditLog } = makeHarness();
    await app.request('/api/download', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credentialId: ID, password: 'correct horse battery' }),
    });
    expect(auditLog.events.some((e) => e.action.includes('download'))).toBe(true);
  });

  it('rejects a wrong password with a generic failure (no info leak)', async () => {
    const { app } = makeHarness();
    const res = await app.request('/api/download', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credentialId: ID, password: 'wrong password' }),
    });
    expect(res.status).toBe(403);
    const body = await asJson(res);
    expect(body.code).toBe('DOWNLOAD_AUTH_FAILED');
    // Generic message: must not reveal whether the id or the password was wrong.
    expect(body.error.toLowerCase()).not.toContain('password');
    expect(body.error.toLowerCase()).not.toContain('not found');
    expect(body.error.toLowerCase()).not.toContain('exist');
  });

  it('returns the SAME generic failure for an unknown credential id', async () => {
    const { app } = makeHarness();
    const wrongPw = await app.request('/api/download', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credentialId: ID, password: 'wrong password' }),
    });
    const unknownId = await app.request('/api/download', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credentialId: 'DMJ-IC-29990101-99', password: 'whatever pass' }),
    });
    expect(unknownId.status).toBe(wrongPw.status);
    const a = await asJson(wrongPw);
    const b = await asJson(unknownId);
    expect(a.code).toBe(b.code);
    expect(a.error).toBe(b.error);
  });

  it('does not leak a 500-vs-403 oracle when verify throws on the dummy hash', async () => {
    // Real Argon2id throws on a foreign PHC string. The missing-id path verifies
    // against the hand-crafted DUMMY hash; if that throw became a 500 while
    // wrong-password returned 403, the status code would reveal id existence.
    const h = makeHarness();
    h.passwordHasher.throwOnUnknown = true; // dummy hash is "unknown" → would throw
    const wrongPw = await h.app.request('/api/download', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credentialId: ID, password: 'wrong password' }),
    });
    const unknownId = await h.app.request('/api/download', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credentialId: 'DMJ-IC-29990101-99', password: 'whatever pass' }),
    });
    // Indistinguishable: same status, code, and message for both (only the
    // random per-request correlation id differs, which leaks nothing).
    expect(unknownId.status).toBe(403);
    expect(unknownId.status).toBe(wrongPw.status);
    const a = await asJson(wrongPw);
    const b = await asJson(unknownId);
    expect(b.code).toBe(a.code);
    expect(b.error).toBe(a.error);
    expect(a.code).toBe('DOWNLOAD_AUTH_FAILED');
  });

  it('still runs a password verification for an unknown id (timing-equalised)', async () => {
    // Defends against a timing oracle: the missing-id path must not short-circuit.
    const { app, passwordHasher } = makeHarness();
    const before = passwordHasher.verifyCalls;
    await app.request('/api/download', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credentialId: 'DMJ-IC-29990101-99', password: 'whatever pass' }),
    });
    expect(passwordHasher.verifyCalls).toBeGreaterThan(before);
  });

  it('feeds the missing-id verify a dummy hash whose cost params match the env', async () => {
    // The dummy must be a well-formed PHC string (so the real hasher does FULL
    // KDF work, not a fast parse-fail) carrying the SAME m/t/p the issuer stamps
    // into real hashes — otherwise a miss is measurably slower/faster than a
    // wrong-password verify, reopening the timing oracle.
    const env = makeEnv();
    const { app, passwordHasher } = makeHarness();
    await app.request('/api/download', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credentialId: 'DMJ-IC-29990101-99', password: 'whatever pass' }),
    });
    const dummy = passwordHasher.lastStored ?? '';
    // Valid envelope the crypto PHC parser requires: 6 `$`-segments, argon2id, v=19.
    const segs = dummy.split('$');
    expect(segs).toHaveLength(6);
    expect(segs[1]).toBe('argon2id');
    expect(segs[2]).toBe('v=19');
    // Param parity with the configured cost (pins against future drift).
    expect(segs[3]).toBe(
      `m=${env.ARGON2_MEMORY_KIB},t=${env.ARGON2_ITERATIONS},p=${env.ARGON2_PARALLELISM}`,
    );
    // Non-empty base64 salt + hash (parser rejects empty).
    expect((segs[4] ?? '').length).toBeGreaterThan(0);
    expect((segs[5] ?? '').length).toBeGreaterThan(0);
  });

  it('prefers the injected dummyPasswordHash for the missing-id verify', async () => {
    // The composition root computes the dummy via passwordHasher.hash(<random>)
    // so it always carries the CURRENT params; the service must use that exact
    // string (not the env-derived fallback) on the unknown-credential path.
    const injected = '$argon2id$v=19$m=19456,t=2,p=1$SSSSSSSSSSSSSSSSSSSSSS$HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH';
    const h = makeHarness();
    const app = createVerifyApp({ ...h.deps, dummyPasswordHash: injected });
    await app.request('/api/download', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credentialId: 'DMJ-IC-29990101-99', password: 'whatever pass' }),
    });
    expect(h.passwordHasher.lastStored).toBe(injected);
  });

  it('rejects a malformed body', async () => {
    const { app } = makeHarness();
    const res = await app.request('/api/download', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credentialId: 'bad', password: '' }),
    });
    expect(res.status).toBe(400);
    const body = await asJson(res);
    expect(body.code).toBe('VALIDATION_FAILED');
  });

  it('applies exponential backoff after repeated failures from the same client', async () => {
    let now = 0;
    const h = makeHarness();
    // Inject a deterministic clock so the backoff window is testable without sleeping.
    const app = createVerifyApp({ ...h.deps, now: () => now });
    const attempt = () =>
      app.request('/api/download', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.5' },
        body: JSON.stringify({ credentialId: ID, password: 'wrong password' }),
      });
    // Burn through the allowed attempts.
    let sawRateLimit = false;
    for (let i = 0; i < 8; i++) {
      const res = await attempt();
      if (res.status === 429) {
        sawRateLimit = true;
        expect(res.headers.get('retry-after')).toBeTruthy();
        break;
      }
    }
    expect(sawRateLimit).toBe(true);
    // After the backoff window elapses, the client may try again (not a permanent block here).
    now += 60 * 60 * 1000;
    const after = await attempt();
    expect(after.status).not.toBe(429);
  });
});

describe('GET /api/credentials/:id/section63', () => {
  it('serves the stored §63 certificate bytes as a PDF (public, no password)', async () => {
    const { app } = makeHarness();
    const res = await app.request(`/api/credentials/${ID}/section63`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/pdf');
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(new TextDecoder().decode(buf)).toContain('section63');
  });

  it('returns 404 for an unknown credential §63', async () => {
    const { app } = makeHarness();
    const res = await app.request('/api/credentials/DMJ-IC-29990101-99/section63');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/credentials/:id/evidence (court-ready evidence bundle)', () => {
  /** Permissive typed view over the bundle JSON for strict-TS field access. */
  interface Bundle {
    meta: { credentialId: string; kind: string; status: string; issuedDate: string; issuer: string; verifyUrl: string };
    content: Record<string, unknown>;
    document: { pdfSha256: string; hashAlgorithm: string };
    canonical: { payload: string; sha256: string; note: string };
    signature: { algorithm: string; valueBase64: string; publicKeyBase64: string; publicKeyId: string };
    transparencyLog: {
      seq: number;
      leafHash: string;
      head: { seq: number; headHash: string; signature: string } | null;
      logPublicKeyBase64: string;
      note: string;
    };
    externalAnchor: { headSeq: number; github?: { repo: string } } | null;
    trustedTimestamp: {
      rfc3161TokenBase64: string;
      verified: { valid: boolean; genTime?: string; tsaSubject?: string };
    } | null;
    howToVerify: string[];
    disclaimer: string;
  }
  const bundleOf = async (res: Response): Promise<Bundle> => (await res.json()) as Bundle;

  it('serves a self-contained JSON bundle as a no-store download (200)', async () => {
    const { app } = makeHarness();
    const res = await app.request(`/api/credentials/${ID}/evidence`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    expect(res.headers.get('content-disposition')).toContain(`${ID}-evidence.json`);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('embeds the signed content, both hashes, the ML-DSA signature + ISSUER public key', async () => {
    const { app, record } = makeHarness();
    const b = await bundleOf(await app.request(`/api/credentials/${ID}/evidence`));
    // The exact signed content + the canonical bytes + the document hash.
    expect(b.content).toBeTruthy();
    expect(b.canonical.payload).toBe(record.canonicalPayload);
    expect(b.canonical.sha256).toBe(record.canonicalSha256);
    expect(b.document.pdfSha256).toBe(record.pdfSha256);
    expect(b.document.hashAlgorithm).toBe('SHA-256');
    // The detached signature + the PUBLIC key needed to verify it offline.
    expect(b.signature.algorithm).toContain('ML-DSA-87');
    expect(b.signature.valueBase64).toBe(record.mldsaSignature);
    expect(b.signature.publicKeyBase64).toBe('TUxEU0EtUFVCTElDLUtFWQ==');
    expect(b.signature.publicKeyId).toBe(record.mldsaPublicKeyId);
  });

  it('embeds the signed transparency-log head + the LOG public key', async () => {
    const { app, record } = makeHarness();
    const b = await bundleOf(await app.request(`/api/credentials/${ID}/evidence`));
    expect(b.transparencyLog.seq).toBe(record.logSeq);
    expect(b.transparencyLog.leafHash).toBe(record.logLeafHash);
    // The actual signed head from logRepo.getHead() (seq + headHash + signature).
    expect(b.transparencyLog.head).toBeTruthy();
    expect(b.transparencyLog.head?.signature).toBe('HEADSIG');
    expect(b.transparencyLog.logPublicKeyBase64).toBe('TE9HLVBVQkxJQy1LRVk=');
  });

  it('carries a tool-named offline how-to and the HONEST disclaimer', async () => {
    const { app } = makeHarness();
    const b = await bundleOf(await app.request(`/api/credentials/${ID}/evidence`));
    expect(Array.isArray(b.howToVerify)).toBe(true);
    expect(b.howToVerify.length).toBeGreaterThanOrEqual(5);
    const how = b.howToVerify.join(' ');
    // Names concrete tools/libraries an expert can actually run offline.
    expect(how).toMatch(/ml_dsa87\.verify|FIPS-204/);
    expect(how).toMatch(/openssl ts -verify|RFC-3161/);
    expect(how).toMatch(/SHA-256/);
    expect(b.disclaimer.length).toBeGreaterThan(0);
  });

  it('includes the VERIFIED trusted timestamp when the record carries a token', async () => {
    // A record WITH a token + the fake verifier's default verified result.
    const h = makeHarness({ tsaTimestampToken: 'fake-tsa-token' }); // pragma: allowlist secret
    const b = await bundleOf(await h.app.request(`/api/credentials/${ID}/evidence`));
    expect(b.trustedTimestamp).not.toBeNull();
    expect(b.trustedTimestamp?.rfc3161TokenBase64).toBe('fake-tsa-token');
    expect(b.trustedTimestamp?.verified.valid).toBe(true);
    expect(b.trustedTimestamp?.verified.genTime).toBe('2026-06-04T10:00:05.000Z');
    expect(b.trustedTimestamp?.verified.tsaSubject).toBe('CN=freeTSA, O=freeTSA.org');
  });

  it('verifies the RFC-3161 token over the RAW ML-DSA signature BYTES (not the base64)', async () => {
    // The token covers base64ToBytes(record.mldsaSignature). Prove the service
    // decoded the signature before calling verifyTimestamp, not passed the string.
    const h = makeHarness({ tsaTimestampToken: 'fake-tsa-token', mldsaSignature: 'q83v' }); // pragma: allowlist secret
    await h.app.request(`/api/credentials/${ID}/evidence`);
    expect(h.verifier.lastTimestampCall).not.toBeNull();
    expect(h.verifier.lastTimestampCall?.token).toBe('fake-tsa-token');
    const expected = new Uint8Array(Buffer.from('q83v', 'base64'));
    expect(Array.from(h.verifier.lastTimestampCall?.data ?? new Uint8Array())).toEqual(
      Array.from(expected),
    );
  });

  it('sets trustedTimestamp to null (honest) when the record has NO token', async () => {
    // The default record (cryptoBlock / makeRecord) carries no tsaTimestampToken.
    const { app } = makeHarness();
    const b = await bundleOf(await app.request(`/api/credentials/${ID}/evidence`));
    expect(b.trustedTimestamp).toBeNull();
    // And the disclaimer says so plainly, rather than silently omitting it.
    expect(b.disclaimer.toLowerCase()).toContain('no independent rfc-3161 timestamp');
  });

  it('mirrors checkAnchor: a GitHub-published proof appears, a bare proof is null', async () => {
    // Published (covers the record) → the proof is embedded.
    const published = makeHarness();
    published.anchorRepo.add({
      headSeq: published.record.logSeq,
      headHash: 'h'.repeat(64),
      anchoredAt: '2026-06-08T00:00:00.000Z',
      github: { repo: 'divyamohan1993/dmjone-trust-anchor', commitSha: 'c'.repeat(40), url: 'https://github.com/x' },
    });
    const pubBundle = await bundleOf(await published.app.request(`/api/credentials/${ID}/evidence`));
    expect(pubBundle.externalAnchor).not.toBeNull();
    expect(pubBundle.externalAnchor?.github?.repo).toBe('divyamohan1993/dmjone-trust-anchor');

    // Bare proof (no github) → null ("pending"), never a false anchored claim.
    const bare = makeHarness();
    bare.anchorRepo.add({ headSeq: bare.record.logSeq, headHash: 'h'.repeat(64), anchoredAt: '2026-06-08T00:00:00.000Z' });
    const bareBundle = await bundleOf(await bare.app.request(`/api/credentials/${ID}/evidence`));
    expect(bareBundle.externalAnchor).toBeNull();
  });

  it('carries the right meta (id, kind, status, issuer, verifyUrl)', async () => {
    const { app } = makeHarness();
    const b = await bundleOf(await app.request(`/api/credentials/${ID}/evidence`));
    expect(b.meta.credentialId).toBe(ID);
    expect(b.meta.kind).toBe('certificate'); // default kind
    expect(b.meta.status).toBe('valid');
    // The signed, human-facing issue date from `content` (not the §63 timestamp).
    expect(b.meta.issuedDate).toBe('2026-06-04');
    expect(b.meta.issuer).toBe('dmj.one Trust Services');
    expect(b.meta.verifyUrl).toBe(`https://verify.dmj.one/c/${ID}`);
  });

  it('returns 404 for an unknown credential id', async () => {
    const { app } = makeHarness();
    const res = await app.request('/api/credentials/DMJ-IC-29990101-99/evidence');
    expect(res.status).toBe(404);
    const body = await asJson(res);
    expect(body.requestId).toBeTruthy();
  });

  it('rejects a malformed credential id with a uniform 400 ApiError', async () => {
    const { app } = makeHarness();
    const res = await app.request('/api/credentials/not a valid id/evidence');
    expect(res.status).toBe(400);
    const body = await asJson(res);
    expect(body.code).toBe('VALIDATION_FAILED');
  });

  // ── Honesty discipline (guarded; the user explicitly demanded it) ───────────
  it('NEVER overclaims: no "court-proof"/"legally guaranteed"/"valid in court", and ML-DSA is flagged not-CCA', async () => {
    const { app } = makeHarness();
    const res = await app.request(`/api/credentials/${ID}/evidence`);
    const raw = await res.text(); // assert over the WHOLE serialized bundle
    expect(raw).not.toMatch(/court-proof/i);
    expect(raw).not.toMatch(/legally guaranteed/i);
    expect(raw).not.toMatch(/valid in court/i);
    // "licensed" must appear ONLY inside the honest "not a licensed …" disclaimer,
    // never as a positive claim — so the only matches are negated ones.
    const licensedHits = raw.match(/licensed/gi) ?? [];
    expect(licensedHits.length).toBeGreaterThan(0);
    expect(raw).toMatch(/not a licensed certifying-authority Digital Signature Certificate/i);
    // The honest framing the bundle MUST carry, verbatim-ish.
    const b = await bundleOf(await app.request(`/api/credentials/${ID}/evidence`));
    const d = b.disclaimer;
    expect(d).toMatch(/self-signed cryptographic attestation/i);
    expect(d).toMatch(/independently-verifiable forensic evidence/i);
    expect(d).toMatch(/not a CCA-recognized algorithm/i);
    expect(d).toMatch(/no statutory presumption/i);
  });
});

describe('GET /c/:credentialId (public credential page)', () => {
  let html: string;
  let status: number;

  beforeEach(async () => {
    const { app } = makeHarness();
    const res = await app.request(`/c/${ID}`);
    status = res.status;
    html = await res.text();
  });

  it('renders HTML server-side with the full HR/legal fields', () => {
    expect(status).toBe(200);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Aarav Sharma'); // recipient
    expect(html).toContain('INTERNSHIP'); // title
    expect(html).toContain('Certificate of'); // kicker
    expect(html).toContain('dmj.one Trust Services'); // issuer
    expect(html).toContain(ID); // credential id
  });

  it('states the honest, self-signed attestation (not a licensed-CA DSC)', () => {
    const lower = html.toLowerCase();
    expect(lower).toContain('independent');
    // Honest about the crypto: self-signed attestation, not a government/licensed DSC.
    expect(lower).toMatch(/self-signed|not a licensed|independent educational/);
  });

  it('offers the §63 download and a password-gated download panel', () => {
    expect(html).toContain('/api/credentials/' + ID + '/section63');
    expect(html.toLowerCase()).toContain('password');
  });

  it('does NOT expose a handwritten-signature image or a direct certificate-PDF link', () => {
    // No signature image anywhere on the public surface.
    expect(html).not.toMatch(/signature\.(png|jpg|jpeg|svg|webp)/i);
    expect(html.toLowerCase()).not.toContain('handwritten signature');
    // The certificate PDF is POST-with-password only: no GET link that yields it.
    expect(html).not.toMatch(/href=["'][^"']*\/api\/download/i);
    expect(html).not.toMatch(/\/certificate\.pdf/i);
  });

  it('respects reduced motion and includes the flip-a-bit tamper explainer', () => {
    expect(html).toContain('prefers-reduced-motion');
    expect(html.toLowerCase()).toContain('flip');
  });

  it('carries the nonce on its scripts and style so it survives its own CSP', () => {
    const scripts = html.match(/<script\b[^>]*>/gi) ?? [];
    // Every script tag that has a body (not src) must carry a nonce.
    for (const tag of scripts) {
      if (!/\bsrc=/.test(tag)) {
        expect(tag).toMatch(/nonce="/);
      }
    }
    // Every inline <style> element must carry the nonce too.
    const styles = html.match(/<style\b[^>]*>/gi) ?? [];
    expect(styles.length).toBeGreaterThan(0);
    for (const tag of styles) {
      expect(tag).toMatch(/nonce="/);
    }
    // No inline event handlers (blocked by nonce CSP).
    expect(html).not.toMatch(/\son\w+=/i);
    // No inline style="" attributes — a nonce authorises <style> elements, NOT
    // the style attribute, so any inline style would be silently dropped by CSP.
    expect(html).not.toMatch(/\sstyle=/i);
  });

  it('makes the download form POST (never a GET that leaks the password into the URL)', () => {
    const formTag = html.match(/<form\b[^>]*id="dl-form"[^>]*>/i)?.[0] ?? '';
    expect(formTag).toMatch(/method="post"/i);
    expect(formTag).toMatch(/action="\/api\/download"/i);
  });

  it('SSRs a real VALID verdict (badge + pill) for a good credential, without JS', () => {
    // The no-JS badge must reflect the server-computed cryptographic verdict.
    expect(html).toMatch(/class="status valid"/);
    expect(html).toContain('>VALID<');
    expect(html).toMatch(/class="pill valid"/);
    // The check ledger is pre-painted server-side (not hidden, members marked pass).
    expect(html).toMatch(/data-check="mldsaSignature" class="pass"/);
  });

  it('SSRs UNKNOWN (not a status echo) when the cryptographic check fails', async () => {
    const h = makeHarness();
    h.verifier.mldsaValid = false; // break the signature → outcome must be unknown
    const res = await h.app.request(`/c/${ID}`);
    const body = await res.text();
    expect(body).toMatch(/class="status unknown"/);
    expect(body).toContain('>UNKNOWN<');
    // The signature row is rendered as failed, server-side.
    expect(body).toMatch(/data-check="mldsaSignature" class="fail"/);
  });

  it('a REVOKED credential LEADS WITH THE WARNING word + alarm glyph, never "Genuine"', async () => {
    // Safety (Tier 1): the live page for a revoked record must read as a warning at
    // a glance — the verdict word is the withdrawal, not "Genuine, but…".
    const { app } = makeHarness({ status: 'revoked', revokedAt: '2026-06-05T00:00:00.000Z' });
    const res = await app.request(`/c/${ID}`);
    const body = await res.text();
    expect(body).toContain('<span id="verdict-word">Revoked.</span>');
    expect(body).not.toMatch(/Genuine, but/i);
    expect(body).toContain('<div class="verdict revoked" id="verdict">');
    // The colour-independent warning glyph fills the hero (no empty seal void).
    expect(body).toContain('class="glyph" aria-hidden="true">⊘');
    // No affirmative evidence line on a withdrawn credential.
    expect(body).not.toContain('class="hardfact"');
    expect(body).not.toContain('class="compare"');
    expect(body).toMatch(/class="pill revoked"/);
  });

  it('the VALID page surfaces the affirmative hero EVIDENCE + compare + honesty lines', () => {
    // The default beforeEach harness is a VALID certificate. A non-scroller must
    // see evidence (hard-fact), a prompt to compare (the cert anti-spoof analogue),
    // and the honesty disclaimer — not just the gold seal + "Genuine.".
    const flat = html.replace(/\s+/g, ' ');
    expect(html).toContain('class="hardfact"');
    expect(flat).toMatch(/Post-quantum signature verified, recorded in the transparency log, not revoked/);
    expect(html).toContain('class="compare"');
    expect(flat).toMatch(/Confirm the name, date and details below match the document/);
    expect(html).toContain('class="honesty"');
    expect(flat).toMatch(/an independent educational initiative, not a government-licensed certifying authority/);
    // Honesty lock: never "all N checks passed" (the anchor may legitimately pend).
    expect(flat).not.toMatch(/all (4|four|the) (cryptographic )?checks passed/i);
  });

  it('offers the court-ready evidence-bundle download link on the live page', () => {
    // Deliverable 2: the evidence action sits next to the §63 download.
    expect(html).toContain('id="dl-evidence"');
    expect(html).toContain(`/api/credentials/${ID}/evidence`);
    expect(html.replace(/\s+/g, ' ')).toMatch(/court-ready evidence bundle/i);
  });

  it('SSRs the honest, conditional trusted-timestamp line WHEN the record carries a verified token', async () => {
    // Closes the loop on the app.ts wiring: verifyRecordTimestamp (decode the raw
    // signature bytes → verifyTimestamp) feeds the conditional page line. The fake
    // verifier's verifyTimestamp defaults to {valid:true, genTime, tsaSubject}.
    const h = makeHarness({ tsaTimestampToken: 'fake-tsa-token' }); // pragma: allowlist secret
    const res = await h.app.request(`/c/${ID}`);
    const body = (await res.text()).replace(/\s+/g, ' ');
    expect(body).toContain('trust-ts');
    expect(body).toMatch(/Independently timestamped by CN=freeTSA, O=freeTSA\.org/);
    expect(body).toContain('2026-06-04T10:00:05.000Z');
    expect(body).toMatch(/not a legal guarantee/i);
    // The service decoded the RAW signature bytes (not the base64 string) for the token.
    expect(h.verifier.lastTimestampCall?.token).toBe('fake-tsa-token');
  });

  it('does NOT render the timestamp line when the record carries NO token (default)', () => {
    // The default harness record has no tsaTimestampToken → the line is absent and
    // nothing is claimed about WHEN the signature existed.
    expect(html).not.toContain('trust-ts');
    expect(html).not.toMatch(/Independently timestamped/i);
  });

  it('does NOT render the timestamp line when a present token FAILS to verify', async () => {
    // Honesty: a token that does not verify earns no line (never an unverified claim).
    const h = makeHarness({ tsaTimestampToken: 'fake-tsa-token' }); // pragma: allowlist secret
    h.verifier.timestampResult = { valid: false };
    const res = await h.app.request(`/c/${ID}`);
    const body = await res.text();
    expect(body).not.toContain('trust-ts');
    expect(body).not.toMatch(/Independently timestamped/i);
  });

  it('renders a branded HTML 404 (not JSON) for an unknown credential', async () => {
    const { app } = makeHarness();
    const res = await app.request('/c/DMJ-IC-29990101-99');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('text/html');
    const body = await res.text();
    expect(body).toContain('<!DOCTYPE html>');
    expect(body.toLowerCase()).toContain('not found');
    // The 404 page must survive its own CSP too: nonce'd <style>, no inline
    // style attributes, no inline event handlers.
    expect(body).toMatch(/<style\b[^>]*nonce="/i);
    expect(body).not.toMatch(/\sstyle=/i);
    expect(body).not.toMatch(/\son\w+=/i);
  });
});
