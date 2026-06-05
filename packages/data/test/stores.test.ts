import { describe, expect, it } from 'vitest';
import type { AnchorProof, AdminAccount } from '@dmjone/shared';
import {
  createInMemoryAdminRepository,
  createInMemoryAnchorRepository,
  createInMemoryStores,
} from '../src/in-memory/index.js';

describe('in-memory AnchorRepository', () => {
  function proof(headSeq: number): AnchorProof {
    return {
      headSeq,
      headHash: `head-${headSeq}`.padEnd(64, '0'),
      github: {
        repo: 'dmjone/anchors',
        commitSha: 'abc123',
        url: 'https://github.com/dmjone/anchors/commit/abc123',
      },
      anchoredAt: '2026-06-04T10:00:00.000Z',
    };
  }

  it('returns null when empty', async () => {
    const repo = createInMemoryAnchorRepository();
    expect(await repo.latest()).toBeNull();
    expect(await repo.forHead(1)).toBeNull();
  });

  it('saves and fetches a proof by head seq', async () => {
    const repo = createInMemoryAnchorRepository();
    await repo.save(proof(5));
    expect(await repo.forHead(5)).toEqual(proof(5));
  });

  it('latest() returns the highest head seq regardless of save order', async () => {
    const repo = createInMemoryAnchorRepository();
    await repo.save(proof(2));
    await repo.save(proof(7));
    await repo.save(proof(4));
    expect((await repo.latest())?.headSeq).toBe(7);
  });

  it('preserves an optional opentimestamps field and omits absent github', async () => {
    const repo = createInMemoryAnchorRepository();
    const otsOnly: AnchorProof = {
      headSeq: 1,
      headHash: 'h'.repeat(64),
      opentimestamps: { otsBase64: 'b64ots', status: 'pending' },
      anchoredAt: '2026-06-04T10:00:00.000Z',
    };
    await repo.save(otsOnly);
    const got = await repo.forHead(1);
    expect(got?.opentimestamps).toEqual({ otsBase64: 'b64ots', status: 'pending' });
    expect('github' in (got as AnchorProof)).toBe(false);
  });
});

describe('in-memory AdminRepository', () => {
  function account(): AdminAccount {
    return {
      id: 'main',
      webauthnCredentials: [
        {
          credentialId: 'cred-1',
          publicKey: 'pk',
          counter: 0,
          label: 'Windows Hello',
          createdAt: '2026-06-04T10:00:00.000Z',
        },
      ],
      recoveryCodeHashes: ['$argon2id$hash1', '$argon2id$hash2'],
      failureCount: 0,
      createdAt: '2026-06-04T10:00:00.000Z',
      updatedAt: '2026-06-04T10:00:00.000Z',
    };
  }

  it('returns null until saved', async () => {
    const repo = createInMemoryAdminRepository();
    expect(await repo.get()).toBeNull();
  });

  it('upserts the single admin account, omitting absent optionals', async () => {
    const repo = createInMemoryAdminRepository();
    await repo.save(account());
    const got = await repo.get();
    expect(got?.id).toBe('main');
    expect('totpSecretEnc' in (got as AdminAccount)).toBe(false);
    expect('lockedUntil' in (got as AdminAccount)).toBe(false);

    const locked: AdminAccount = { ...account(), failureCount: 3, lockedUntil: '2026-06-04T11:00:00.000Z' };
    await repo.save(locked);
    const updated = await repo.get();
    expect(updated?.failureCount).toBe(3);
    expect(updated?.lockedUntil).toBe('2026-06-04T11:00:00.000Z');
  });
});

describe('createInMemoryStores', () => {
  it('returns an independent, complete store set', async () => {
    const a = createInMemoryStores();
    const b = createInMemoryStores();
    await a.secrets.set('k', 'va');
    // Independent instances must not share state.
    expect(await b.secrets.get('k')).toBeNull();

    expect(a.credentials).toBeDefined();
    expect(a.blobs).toBeDefined();
    expect(a.log).toBeDefined();
    expect(a.anchors).toBeDefined();
    expect(a.admin).toBeDefined();
    expect(a.audit).toBeDefined();
    expect(a.secrets).toBeDefined();
  });
});
