import { describe, expect, it } from 'vitest';
import { AppError } from '@dmjone/shared';
import type { LetterContent, UploadAttestation } from '@dmjone/shared';
import { createInMemoryCredentialRepository } from '../src/in-memory/credential-repository.js';
import { makeLetterRecord, makeRecord, makeUploadRecord } from './fixtures.js';

describe('in-memory CredentialRepository', () => {
  it('creates and reads back a record by id', async () => {
    const repo = createInMemoryCredentialRepository();
    const record = makeRecord();
    await repo.create(record);

    expect(await repo.exists(record.id)).toBe(true);
    const fetched = await repo.getById(record.id);
    expect(fetched).toEqual(record);
  });

  it('returns null / false for an unknown id', async () => {
    const repo = createInMemoryCredentialRepository();
    expect(await repo.getById('DMJ-IC-20260604-99')).toBeNull();
    expect(await repo.exists('DMJ-IC-20260604-99')).toBe(false);
  });

  it('rejects a duplicate create with CREDENTIAL_EXISTS', async () => {
    const repo = createInMemoryCredentialRepository();
    const record = makeRecord();
    await repo.create(record);
    await expect(repo.create(record)).rejects.toMatchObject({
      code: 'CREDENTIAL_EXISTS',
    });
  });

  it('does not let callers mutate stored state by aliasing', async () => {
    const repo = createInMemoryCredentialRepository();
    const record = makeRecord();
    await repo.create(record);
    record.content.recipientName = 'TAMPERED';
    const fetched = await repo.getById(record.id);
    expect(fetched?.content.recipientName).toBe('Asha Rao');
  });

  it('sets status to revoked and stamps revokedAt; valid omits it', async () => {
    const repo = createInMemoryCredentialRepository();
    const record = makeRecord();
    await repo.create(record);

    await repo.setStatus(record.id, 'revoked', '2026-06-05T00:00:00.000Z');
    const revoked = await repo.getById(record.id);
    expect(revoked?.status).toBe('revoked');
    expect(revoked?.revokedAt).toBe('2026-06-05T00:00:00.000Z');

    await repo.setStatus(record.id, 'valid', '2026-06-06T00:00:00.000Z');
    const back = await repo.getById(record.id);
    expect(back?.status).toBe('valid');
    expect(back?.revokedAt).toBeUndefined();
  });

  it('stores a provided statusSignature and drops a stale one when omitted', async () => {
    const repo = createInMemoryCredentialRepository();
    const record = makeRecord();
    await repo.create(record);

    const sig = { value: 'c2ln', asOf: '2026-06-05T00:00:00.000Z' };
    await repo.setStatus(record.id, 'revoked', '2026-06-05T00:00:00.000Z', sig);
    const revoked = await repo.getById(record.id);
    expect(revoked?.statusSignature).toEqual(sig);

    // A status change WITHOUT a fresh signature must drop the stale one (a
    // signature must never outlive the status it attests).
    await repo.setStatus(record.id, 'valid', '2026-06-06T00:00:00.000Z');
    const back = await repo.getById(record.id);
    expect(back?.statusSignature).toBeUndefined();
  });

  it('throws CREDENTIAL_NOT_FOUND when setting status on a missing id', async () => {
    const repo = createInMemoryCredentialRepository();
    await expect(
      repo.setStatus('DMJ-IC-20260604-99', 'revoked', '2026-06-05T00:00:00.000Z'),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('paginates with a cursor over multiple pages, no overlap, no gaps', async () => {
    const repo = createInMemoryCredentialRepository();
    const ids: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const id = `DMJ-IC-20260604-0${i}`;
      ids.push(id);
      await repo.create(makeRecord({ id }));
    }

    const page1 = await repo.list({ limit: 2 });
    expect(page1.items.map((r) => r.id)).toEqual([ids[0], ids[1]]);
    expect(page1.nextCursor).toBe(ids[1]);

    const page2 = await repo.list({ limit: 2, cursor: page1.nextCursor });
    expect(page2.items.map((r) => r.id)).toEqual([ids[2], ids[3]]);
    expect(page2.nextCursor).toBe(ids[3]);

    const page3 = await repo.list({ limit: 2, cursor: page2.nextCursor });
    expect(page3.items.map((r) => r.id)).toEqual([ids[4]]);
    // Final partial page → no further cursor.
    expect(page3.nextCursor).toBeUndefined();
  });

  it('returns an empty list when there are no records', async () => {
    const repo = createInMemoryCredentialRepository();
    const page = await repo.list();
    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeUndefined();
  });

  it('orders by id ascending regardless of insertion order', async () => {
    const repo = createInMemoryCredentialRepository();
    // Insert out of id order on purpose.
    for (const id of ['DMJ-IC-20260604-03', 'DMJ-IC-20260604-01', 'DMJ-IC-20260604-02']) {
      await repo.create(makeRecord({ id }));
    }
    const page = await repo.list({ limit: 10 });
    expect(page.items.map((r) => r.id)).toEqual([
      'DMJ-IC-20260604-01',
      'DMJ-IC-20260604-02',
      'DMJ-IC-20260604-03',
    ]);
  });

  it('does not dangle a cursor when the last full page exactly exhausts the set', async () => {
    const repo = createInMemoryCredentialRepository();
    for (let i = 1; i <= 4; i++) await repo.create(makeRecord({ id: `DMJ-IC-20260604-0${i}` }));

    const page1 = await repo.list({ limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBeDefined();

    // total === 2 * limit: page 2 exactly exhausts the set → NO further cursor.
    const page2 = await repo.list({ limit: 2, cursor: page1.nextCursor });
    expect(page2.items).toHaveLength(2);
    expect(page2.nextCursor).toBeUndefined();
  });

  // ── WS2-B: non-enumerable retrieval by unguessable token ──────────────────
  describe('getByToken', () => {
    it('finds a record by its verifyToken', async () => {
      const repo = createInMemoryCredentialRepository();
      const record = makeRecord({ verifyToken: 'tok_abc123' });
      await repo.create(record);

      const fetched = await repo.getByToken('tok_abc123');
      expect(fetched).toEqual(record);
    });

    it('returns null for an unknown token', async () => {
      const repo = createInMemoryCredentialRepository();
      await repo.create(makeRecord({ verifyToken: 'tok_abc123' }));
      expect(await repo.getByToken('tok_does_not_exist')).toBeNull();
    });

    it('returns null when no record carries a token (legacy-only store)', async () => {
      const repo = createInMemoryCredentialRepository();
      await repo.create(makeRecord()); // no verifyToken (legacy)
      // A legacy record must NOT match an empty/undefined token probe.
      expect(await repo.getByToken('')).toBeNull();
      expect(await repo.getByToken('tok_abc123')).toBeNull();
    });

    it('does not let callers mutate stored state via the token-fetched object', async () => {
      const repo = createInMemoryCredentialRepository();
      await repo.create(makeRecord({ verifyToken: 'tok_abc123' }));
      const fetched = await repo.getByToken('tok_abc123');
      (fetched!.content as { recipientName: string }).recipientName = 'TAMPERED';
      const again = await repo.getByToken('tok_abc123');
      expect((again!.content as { recipientName: string }).recipientName).toBe('Asha Rao');
    });
  });

  // ── WS2-A: true erasure (DPDP §8(7)) — distinct from revocation ───────────
  describe('erase', () => {
    const AT = '2026-06-10T00:00:00.000Z';

    it('blanks certificate PII but RETAINS all crypto/log residue', async () => {
      const repo = createInMemoryCredentialRepository();
      const record = makeRecord({
        verifyToken: 'tok_keepme',
        issuerAttestation: { confirmed: true, attestedAt: '2026-06-04T10:00:00.000Z' },
      });
      await repo.create(record);

      await repo.erase(record.id, AT);
      const erased = await repo.getById(record.id);
      const content = erased!.content as CredentialContent;

      // PII purged.
      expect(content.recipientName).toBe('');
      expect(content.intro).toBe('');
      expect(content.title).toBe('');
      expect(content.kicker).toBe('');
      expect(content.bodyParagraphs).toEqual([]);
      expect(content.closingLine).toBe('');
      expect(erased!.canonicalPayload).toBe('');

      // Erasure flags set.
      expect(erased!.erased).toBe(true);
      expect(erased!.erasedAt).toBe(AT);

      // Crypto / log / gating residue RETAINED (lets the tombstone prove a doc
      // existed and was erased, with zero PII).
      expect(erased!.id).toBe(record.id);
      expect(erased!.pdfSha256).toBe(record.pdfSha256);
      expect(erased!.canonicalSha256).toBe(record.canonicalSha256);
      expect(erased!.mldsaSignature).toBe(record.mldsaSignature);
      expect(erased!.mldsaPublicKeyId).toBe(record.mldsaPublicKeyId);
      expect(erased!.padesCertFingerprint).toBe(record.padesCertFingerprint);
      expect(erased!.logSeq).toBe(record.logSeq);
      expect(erased!.logLeafHash).toBe(record.logLeafHash);
      expect(erased!.passwordHash).toBe(record.passwordHash);
      expect(erased!.createdAt).toBe(record.createdAt);
      // section63 is hash + machine facts (no recipient PII) → retained; the
      // rendered §63 blob is purged separately by the caller via BlobStore.delete.
      expect(erased!.section63).toEqual(record.section63);
      // The token + attestation are NOT recipient PII and the tombstone is still
      // reachable at /v/<token>, so they are retained.
      expect(erased!.verifyToken).toBe('tok_keepme');
      expect(erased!.issuerAttestation).toEqual({
        confirmed: true,
        attestedAt: '2026-06-04T10:00:00.000Z',
      });
      // Retained non-PII content facts (signatory/type/issueDate).
      expect(content.signatory).toEqual(record.content.signatory);
      expect(content.type).toBe((record.content as CredentialContent).type);
      expect(content.issueDate).toBe(record.content.issueDate);
    });

    it('blanks letter PII (recipientLines/subject/salutation/body/valediction/reference)', async () => {
      const repo = createInMemoryCredentialRepository();
      const record = makeLetterRecord();
      await repo.create(record);

      await repo.erase(record.id, AT);
      const content = (await repo.getById(record.id))!.content as LetterContent;

      expect(content.recipientLines).toEqual([]);
      expect(content.subject).toBe('');
      expect(content.salutation).toBe('');
      expect(content.bodyParagraphs).toEqual([]);
      expect(content.valediction).toBe('');
      expect(content.reference).toBe('');
      // Retained non-PII facts.
      expect(content.issueDate).toBe('2026-06-08');
      expect(content.signatory.name).toBe('Divya Mohan');
    });

    it('blanks upload PII (originalFilename) but keeps originalSha256/pageCount', async () => {
      const repo = createInMemoryCredentialRepository();
      const record = makeUploadRecord();
      await repo.create(record);

      await repo.erase(record.id, AT);
      const content = (await repo.getById(record.id))!.content as UploadAttestation;

      expect(content.originalFilename).toBe('');
      // originalSha256 + pageCount are machine facts, not recipient PII → retained.
      expect(content.originalSha256).toBe('c'.repeat(64));
      expect(content.pageCount).toBe(3);
      expect(content.signatory.name).toBe('Divya Mohan');
    });

    it('is idempotent: a second erase is a no-op and preserves the original erasedAt', async () => {
      const repo = createInMemoryCredentialRepository();
      const record = makeRecord();
      await repo.create(record);

      await repo.erase(record.id, AT);
      await repo.erase(record.id, '2030-01-01T00:00:00.000Z'); // later instant
      const erased = await repo.getById(record.id);

      expect(erased!.erased).toBe(true);
      expect(erased!.erasedAt).toBe(AT); // original timestamp, not the second call's
    });

    it('preserves revocation state across erase (separate states)', async () => {
      const repo = createInMemoryCredentialRepository();
      const record = makeRecord();
      await repo.create(record);

      await repo.setStatus(record.id, 'revoked', '2026-06-05T00:00:00.000Z');
      await repo.erase(record.id, AT);
      const erased = await repo.getById(record.id);

      // Erasure does not un-revoke; revocation does not erase. Independent axes.
      expect(erased!.status).toBe('revoked');
      expect(erased!.revokedAt).toBe('2026-06-05T00:00:00.000Z');
      expect(erased!.erased).toBe(true);
    });

    it('throws CREDENTIAL_NOT_FOUND when erasing a missing id', async () => {
      const repo = createInMemoryCredentialRepository();
      await expect(repo.erase('DMJ-IC-20260604-99', AT)).rejects.toMatchObject({
        code: 'CREDENTIAL_NOT_FOUND',
      });
    });

    it('an erased record is no longer retrievable by its (now-retained) token with PII', async () => {
      // The token still resolves the tombstone (so /v/<token> can render it),
      // but the resolved record carries no recipient PII.
      const repo = createInMemoryCredentialRepository();
      await repo.create(makeRecord({ verifyToken: 'tok_keepme' }));
      await repo.erase('DMJ-IC-20260604-01', AT);

      const viaToken = await repo.getByToken('tok_keepme');
      expect(viaToken).not.toBeNull();
      expect(viaToken!.erased).toBe(true);
      expect((viaToken!.content as CredentialContent).recipientName).toBe('');
    });
  });
});
