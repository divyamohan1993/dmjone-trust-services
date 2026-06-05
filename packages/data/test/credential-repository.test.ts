import { describe, expect, it } from 'vitest';
import { AppError } from '@dmjone/shared';
import { createInMemoryCredentialRepository } from '../src/in-memory/credential-repository.js';
import { makeRecord } from './fixtures.js';

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
});
