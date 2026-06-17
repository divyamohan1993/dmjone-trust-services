/**
 * WS2 — non-enumerable retrieval (unguessable token) + true erasure.
 *
 * The security invariant: a NEW (tokened) record's PII is reachable ONLY via its
 * `/v/<token>`; by its sequential id every PII route reads as not-found, so the
 * id is no enumeration oracle. A LEGACY (token-less) record stays id-addressable.
 * An ERASED record short-circuits to a PII-free tombstone on every read path,
 * never attempting (now-impossible) signature verification.
 */
import { describe, expect, it } from 'vitest';
import { createVerifyApp, type VerifyDeps } from '../src/app.js';
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
  makeEnv,
  makeLogger,
  makeRecord,
} from './fakes.js';
import type { CredentialRecord } from '@dmjone/shared';

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUv'; // 22 base64url chars; pragma: allowlist secret -- test fixture, not a real token
const ID = 'DMJ-IC-20260604-01';
const NAME = 'Aarav Sharma'; // makeRecord()'s recipientName

function makeApp(records: CredentialRecord[]) {
  const credentialRepo = new FakeCredentialRepository(records);
  const blobStore = new FakeBlobStore();
  for (const r of records) {
    blobStore.set(r.id, 'certificate', new TextEncoder().encode('%PDF-1.7 cert %%EOF'));
    blobStore.set(r.id, 'section63', new TextEncoder().encode('%PDF-1.7 s63 %%EOF'));
  }
  const deps: VerifyDeps = {
    env: makeEnv() as VerifyDeps['env'],
    logger: makeLogger(),
    credentialRepo,
    blobStore,
    logRepo: new FakeLogRepository(),
    anchorRepo: new FakeAnchorRepository(),
    auditLog: new FakeAuditLog(),
    verifier: new FakeSignatureVerifier(),
    logVerifier: new FakeLogVerifier(),
    passwordHasher: new FakePasswordHasher(),
    trustedPadesCertFingerprint: 'c'.repeat(64),
    evidenceKeys: { mldsaPublicKeyBase64: 'QQ==', logMldsaPublicKeyBase64: 'QQ==' },
  };
  return { app: createVerifyApp(deps), credentialRepo };
}

describe('WS2 — tokened (new) record is reachable only by token', () => {
  const tokened = () => makeRecord({ verifyToken: TOKEN });

  it('GET /v/:token renders the page with the recipient PII', async () => {
    const { app } = makeApp([tokened()]);
    const res = await app.request(`/v/${TOKEN}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain(NAME);
  });

  it('GET /c/:id for a tokened record is a uniform 404 (no PII, no existence oracle)', async () => {
    const { app } = makeApp([tokened()]);
    const res = await app.request(`/c/${ID}`);
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).not.toContain(NAME);
    // Indistinguishable from a genuinely-absent id.
    const absent = await makeApp([]).app.request(`/c/${ID}`);
    expect(absent.status).toBe(404);
  });

  it('GET /api/verify/:id for a tokened record returns the PII-free unknown shape', async () => {
    const { app } = makeApp([tokened()]);
    const body = await asJson(await app.request(`/api/verify/${ID}`));
    expect(body.outcome).toBe('unknown');
    expect(body.publicFields).toBeUndefined();
  });

  it('GET /api/verify/by-token/:token returns the full result with publicFields', async () => {
    const { app } = makeApp([tokened()]);
    const body = await asJson(await app.request(`/api/verify/by-token/${TOKEN}`));
    expect(body.publicFields?.recipientName).toBe(NAME);
  });

  it('§63 and evidence are 404 by id but served by token', async () => {
    const { app } = makeApp([tokened()]);
    expect((await app.request(`/api/credentials/${ID}/section63`)).status).toBe(404);
    expect((await app.request(`/api/credentials/${ID}/evidence`)).status).toBe(404);
    expect((await app.request(`/v/${TOKEN}/section63`)).status).toBe(200);
    const ev = await app.request(`/v/${TOKEN}/evidence`);
    expect(ev.status).toBe(200);
    expect(await ev.text()).toContain(NAME); // the bundle embeds the signed content
  });

  it('status is 404 by id for a tokened record but served at /v/:token/status', async () => {
    const { app } = makeApp([tokened()]);
    // The exact oracle the security review caught: status must NOT be reachable by id.
    expect((await app.request(`/api/credentials/${ID}/status`)).status).toBe(404);
    const ok = await app.request(`/v/${TOKEN}/status`);
    expect(ok.status).toBe(200);
    expect((await asJson(await app.request(`/v/${TOKEN}/status`))).status).toBe('valid');
  });

  it('the file-gate accepts the token (not just the id)', async () => {
    const { app } = makeApp([tokened()]);
    const fd = new FormData();
    fd.append('verifyToken', TOKEN);
    fd.append('file', new File([new TextEncoder().encode('not the cert')], 'x.pdf', { type: 'application/pdf' }));
    const body = await asJson(await app.request('/api/verify/file', { method: 'POST', body: fd }));
    // Wrong bytes ⇒ tampered, but crucially the record WAS resolved (publicFields present).
    expect(body.publicFields?.recipientName).toBe(NAME);
    expect(body.checks.hashMatch).toBe(false);
  });
});

describe('WS2 — legacy (token-less) record stays id-addressable', () => {
  it('GET /c/:id still serves a legacy record', async () => {
    const { app } = makeApp([makeRecord()]); // no verifyToken
    const res = await app.request(`/c/${ID}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain(NAME);
  });

  it('GET /v/:token for an unknown token is a uniform 404', async () => {
    const { app } = makeApp([makeRecord()]);
    expect((await app.request(`/v/${TOKEN}`)).status).toBe(404);
  });
});

describe('WS2 — erased record short-circuits to a PII-free tombstone', () => {
  const erased = () =>
    makeRecord({ verifyToken: TOKEN, erased: true, erasedAt: '2026-06-18T00:00:00.000Z' });

  it('GET /v/:token renders the tombstone (410), never the PII or a broken verdict', async () => {
    const { app } = makeApp([erased()]);
    const res = await app.request(`/v/${TOKEN}`);
    expect(res.status).toBe(410);
    const body = await res.text();
    expect(body).toContain('erased');
    expect(body).not.toContain(NAME);
  });

  it('status: by-id is gated (404); the erased marker is served at /v/:token/status, no PII', async () => {
    const { app } = makeApp([erased()]);
    // An erased TOKENED record is not reachable by its sequential id.
    expect((await app.request(`/api/credentials/${ID}/status`)).status).toBe(404);
    const res = await app.request(`/v/${TOKEN}/status`);
    expect(res.status).toBe(200);
    const body = await asJson(await app.request(`/v/${TOKEN}/status`));
    expect(body.status).toBe('erased');
    expect(JSON.stringify(body)).not.toContain(NAME);
  });

  it('POST /api/download for an erased record is the GENERIC 403 (not 410/500 — no id distinguisher)', async () => {
    const { app } = makeApp([erased()]);
    const res = await app.request('/api/download', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credentialId: ID, password: 'whatever' }),
    });
    expect(res.status).toBe(403);
  });
});
