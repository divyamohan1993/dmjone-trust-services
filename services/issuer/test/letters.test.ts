/**
 * Mode 2 — letterhead letter routes: POST /api/letters (+ /preview).
 *
 * Mirrors the certificate issuance + preview tests:
 *   - issue runs the pipeline in order, mints a DMJ-LTR id, persists a
 *     kind:'letter' record + both blobs, returns { documentId }, 201;
 *   - preview is strictly side-effect-free (200 application/pdf, placeholder QR,
 *     none of the forbidden collaborators touched);
 *   - auth + validation gates behave uniformly.
 */

import { CREDENTIAL_ID_REGEX, ERROR_CODE } from '@dmjone/shared';
import type { LetterContent } from '@dmjone/shared';
import { describe, expect, it, vi } from 'vitest';

import { createIssuerApp } from '../src/app.js';
import { buildDeps } from './fakes.js';
import { mintSessionCookie } from './session-helper.js';

const LETTERS_PATH = '/api/letters';
const PREVIEW_PATH = '/api/letters/preview';
const PREVIEW_ID = 'DMJ-LTR-00000000-00';

/** A valid letter issuance body. */
function letterBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    issueDate: '2026-06-05',
    reference: 'DMJ/2026/0042',
    recipientLines: ['The Registrar', 'Example University', 'New Delhi'],
    subject: 'Confirmation of academic standing',
    salutation: 'Dear Sir/Madam,',
    bodyParagraphs: [
      '[[align:justify]]This letter **confirms** the bearer completed the programme.',
      'A second paragraph for body length.',
    ],
    valediction: 'Sincerely,',
    password: 'a-strong-password', // pragma: allowlist secret
    ...overrides,
  };
}

async function authedPost(
  app: ReturnType<typeof createIssuerApp>,
  cookie: string,
  path: string,
  body: unknown,
): Promise<Response> {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}

describe('POST /api/letters — issuance happy path', () => {
  it('runs the pipeline in order and returns a well-formed DMJ-LTR id', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const res = await authedPost(app, cookie, LETTERS_PATH, letterBody());

    expect(res.status).toBe(201);
    const json = (await res.json()) as { documentId: string };
    expect(json.documentId).toMatch(CREDENTIAL_ID_REGEX);
    // LTR prefix, issueDate 2026-06-05 → 20260605, first of day → 01.
    expect(json.documentId).toBe('DMJ-LTR-20260605-01');

    // The externally observable pipeline order (letter path renders via renderLetter).
    expect(deps.trace).toEqual([
      'renderLetter',
      'sign',
      's63meta',
      'logAppend',
      'put:certificate',
      's63generate',
      'put:section63',
      'audit',
    ]);
  });

  it('persists a complete kind:letter record and both blobs', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    await authedPost(app, cookie, LETTERS_PATH, letterBody());

    const record = await deps.credentialRepo.getById('DMJ-LTR-20260605-01');
    expect(record).not.toBeNull();
    expect(record?.kind).toBe('letter');
    expect(record?.status).toBe('valid');
    expect(record?.passwordHash).toBe('$argon2id$fake$a-strong-password');
    expect(record?.logSeq).toBe(1);
    expect(record?.mldsaSignature).toBe('c2lnbmF0dXJl');

    // Content is the LetterContent we assembled (subject/recipient preserved verbatim).
    const content = record?.content as LetterContent;
    expect(content.documentId).toBe('DMJ-LTR-20260605-01');
    expect(content.subject).toBe('Confirmation of academic standing');
    expect(content.recipientLines).toEqual(['The Registrar', 'Example University', 'New Delhi']);
    expect(content.bodyParagraphs).toHaveLength(2);
    expect(content.signatory.name).toBe('Divya Mohan');

    // Both PDFs stored at issue-time (signed letter under the 'certificate' blob kind).
    expect(await deps.blobStore.get('DMJ-LTR-20260605-01', 'certificate')).not.toBeNull();
    expect(await deps.blobStore.get('DMJ-LTR-20260605-01', 'section63')).not.toBeNull();

    // QR points at the public verify document page for the allocated id.
    expect(deps.renderer.lastLetterOpts?.qrUrl).toBe(
      'https://verify.example.test/c/DMJ-LTR-20260605-01',
    );
  });

  it('omits optional fields from content when absent (reference/subject/etc.)', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const body = letterBody();
    delete body.reference;
    delete body.subject;
    delete body.salutation;
    delete body.valediction;
    const res = await authedPost(app, cookie, LETTERS_PATH, body);
    expect(res.status).toBe(201);

    const record = await deps.credentialRepo.getById('DMJ-LTR-20260605-01');
    const content = record?.content as LetterContent;
    // The keys are absent (not set to undefined) — mirrors the canonical signing shape.
    expect('reference' in content).toBe(false);
    expect('subject' in content).toBe(false);
    expect('salutation' in content).toBe(false);
    expect('valediction' in content).toBe(false);
  });

  it('allocates the next per-day sequence when 01 is taken', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const first = await authedPost(app, cookie, LETTERS_PATH, letterBody());
    const second = await authedPost(app, cookie, LETTERS_PATH, letterBody());

    expect(((await first.json()) as { documentId: string }).documentId).toBe('DMJ-LTR-20260605-01');
    expect(((await second.json()) as { documentId: string }).documentId).toBe('DMJ-LTR-20260605-02');
  });

  it('does not let a failed external anchor block issuance', async () => {
    const deps = buildDeps();
    deps.anchorPublisher.shouldFail = true;
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const res = await authedPost(app, cookie, LETTERS_PATH, letterBody());

    expect(res.status).toBe(201);
    expect(deps.anchorRepo.proofs).toHaveLength(0);
    expect(await deps.credentialRepo.getById('DMJ-LTR-20260605-01')).not.toBeNull();
  });
});

describe('POST /api/letters — TSA timestamp persistence', () => {
  it('persists tsaTimestampToken on the record when the signer produced one', async () => {
    const deps = buildDeps({ tsaTimestampToken: 'fake-letter-token' }); // pragma: allowlist secret
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    await authedPost(app, cookie, LETTERS_PATH, letterBody());

    const record = await deps.credentialRepo.getById('DMJ-LTR-20260605-01');
    expect(record?.tsaTimestampToken).toBe('fake-letter-token');
  });

  it('omits tsaTimestampToken entirely when the signer returned none', async () => {
    const deps = buildDeps(); // default fake signer attaches no token
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    await authedPost(app, cookie, LETTERS_PATH, letterBody());

    const record = await deps.credentialRepo.getById('DMJ-LTR-20260605-01');
    expect('tsaTimestampToken' in record!).toBe(false);
  });
});

describe('POST /api/letters — auth + validation', () => {
  it('rejects unauthenticated issuance with a uniform 401', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);

    const res = await app.request(LETTERS_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(letterBody()),
    });

    expect(res.status).toBe(401);
    expect(((await res.json()) as { code: string }).code).toBe(ERROR_CODE.UNAUTHENTICATED);
    expect(deps.credentialRepo.createCount).toBe(0);
    expect(deps.trace).toEqual([]);
  });

  it('rejects an invalid body (empty bodyParagraphs) with VALIDATION_FAILED', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const res = await authedPost(app, cookie, LETTERS_PATH, letterBody({ bodyParagraphs: [] }));

    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe(ERROR_CODE.VALIDATION_FAILED);
    expect(deps.credentialRepo.createCount).toBe(0);
  });

  it('rejects a short password with VALIDATION_FAILED', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const res = await authedPost(app, cookie, LETTERS_PATH, letterBody({ password: 'short' }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe(ERROR_CODE.VALIDATION_FAILED);
  });
});

describe('POST /api/letters/preview — exact, side-effect-free render', () => {
  it('rejects an unauthenticated preview with a uniform 401', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);

    const res = await app.request(PREVIEW_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(letterBody()),
    });

    expect(res.status).toBe(401);
    expect(deps.trace).toEqual([]);
  });

  it('returns 200 application/pdf with the exact preview headers + placeholder QR', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const res = await authedPost(app, cookie, PREVIEW_PATH, letterBody());

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toBe('inline; filename="letter-preview.pdf"');
    expect(res.headers.get('cache-control')).toBe('no-store');

    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(res.headers.get('content-length')).toBe(String(bytes.byteLength));

    // The single observable effect is the letter render, with the placeholder QR.
    expect(deps.trace).toEqual(['renderLetter']);
    expect(deps.renderer.lastLetterOpts?.qrUrl).toBe(`https://verify.example.test/c/${PREVIEW_ID}`);
  });

  it('accepts a body that still carries `password` (schema OMITS it, never hashes it)', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const res = await authedPost(app, cookie, PREVIEW_PATH, {
      ...letterBody(),
      password: 'a-strong-password', // pragma: allowlist secret
    });

    expect(res.status).toBe(200);
    expect(deps.passwordHasher.hashed).toHaveLength(0);
  });

  it('touches NONE of the forbidden collaborators (strictly side-effect-free)', async () => {
    const deps = buildDeps();

    const sign = vi.spyOn(deps.signer, 'sign');
    const s63meta = vi.spyOn(deps.section63, 'metadata');
    const s63generate = vi.spyOn(deps.section63, 'generate');
    const appendLeaf = vi.spyOn(deps.logRepo, 'appendLeaf');
    const hash = vi.spyOn(deps.passwordHasher, 'hash');
    const create = vi.spyOn(deps.credentialRepo, 'create');
    const put = vi.spyOn(deps.blobStore, 'put');
    const publish = vi.spyOn(deps.anchorPublisher, 'publish');
    const saveAnchor = vi.spyOn(deps.anchorRepo, 'save');
    const audit = vi.spyOn(deps.auditLog, 'append');
    const renderLetter = vi.spyOn(deps.renderer, 'renderLetter');

    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    const res = await authedPost(app, cookie, PREVIEW_PATH, letterBody());
    expect(res.status).toBe(200);

    expect(renderLetter).toHaveBeenCalledTimes(1);
    expect(sign).not.toHaveBeenCalled();
    expect(s63meta).not.toHaveBeenCalled();
    expect(s63generate).not.toHaveBeenCalled();
    expect(appendLeaf).not.toHaveBeenCalled();
    expect(hash).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
    expect(saveAnchor).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();

    // And nothing landed in the data layer.
    expect(deps.credentialRepo.records.size).toBe(0);
    expect(deps.blobStore.blobs.size).toBe(0);
    expect(deps.logRepo.leaves).toHaveLength(0);
    expect(deps.auditLog.events).toHaveLength(0);
  });
});
