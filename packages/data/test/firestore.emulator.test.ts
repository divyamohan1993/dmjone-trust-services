/**
 * Emulator-gated parity tests for the Firestore-backed stores.
 *
 * These run the SAME behavioral assertions as the in-memory suite, but against
 * the real Firestore implementations talking to the local Firestore emulator.
 * They are the guard against the in-memory and Firestore families silently
 * diverging (the in-memory suite structurally cannot catch a Firestore-only
 * bug). They SELF-SKIP when FIRESTORE_EMULATOR_HOST is unset, so the default
 * `pnpm --filter @dmjone/data test` stays green with no GCP and no emulator.
 *
 * Run them with:
 *   gcloud beta emulators firestore start --host-port=localhost:8080   (separate shell)
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 pnpm --filter @dmjone/data test
 *
 * Each test uses unique credential ids so emulator state (which persists across
 * a run) cannot contaminate other tests.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { AppError, GENESIS_HEAD_HASH } from '@dmjone/shared';
import type { Firestore } from '@google-cloud/firestore';
import { createFirestore } from '../src/firestore/client.js';
import { createFirestoreCredentialRepository } from '../src/firestore/credential-repository.js';
import { createFirestoreBlobStore } from '../src/firestore/blob-store.js';
import { createFirestoreLogRepository } from '../src/firestore/log-repository.js';
import { createFirestoreAnchorRepository } from '../src/firestore/anchor-repository.js';
import { createFirestoreAdminRepository } from '../src/firestore/admin-repository.js';
import { createFirestoreAuditLog } from '../src/firestore/audit-log.js';
import { makeLeafAndHead, makeRecord } from './fixtures.js';

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;

// A fresh project id per process keeps separate runs from colliding in a
// long-lived emulator.
const PROJECT_ID = `data-test-${Date.now()}`;

function db(): Firestore {
  return createFirestore({
    GCP_PROJECT_ID: PROJECT_ID,
    FIRESTORE_DATABASE_ID: '(default)',
    FIRESTORE_EMULATOR_HOST: EMULATOR,
  });
}

describe.skipIf(!EMULATOR)('Firestore stores (emulator) — parity with in-memory', () => {
  const client = db();
  afterAll(async () => {
    await client.terminate();
  });

  it('credential CRUD + revokedAt invariant', async () => {
    const repo = createFirestoreCredentialRepository(client);
    const id = `DMJ-IC-20260604-${rnd()}`;
    const record = makeRecord({ id });

    await repo.create(record);
    expect(await repo.exists(id)).toBe(true);
    expect(await repo.getById(id)).toEqual(record);
    expect(await repo.getById(`DMJ-IC-20260604-${rnd()}`)).toBeNull();

    await expect(repo.create(record)).rejects.toMatchObject({ code: 'CREDENTIAL_EXISTS' });

    await repo.setStatus(id, 'revoked', '2026-06-05T00:00:00.000Z');
    const revoked = await repo.getById(id);
    expect(revoked?.status).toBe('revoked');
    expect(revoked?.revokedAt).toBe('2026-06-05T00:00:00.000Z');

    await repo.setStatus(id, 'valid', '2026-06-06T00:00:00.000Z');
    const back = await repo.getById(id);
    expect(back?.status).toBe('valid');
    expect(back?.revokedAt).toBeUndefined();

    await expect(
      repo.setStatus(`DMJ-IC-20260604-${rnd()}`, 'revoked', 'x'),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('credential list paginates id-ascending with no dangling cursor at the boundary', async () => {
    const repo = createFirestoreCredentialRepository(client);
    const prefix = `DMJ-PG-${rnd()}-`;
    // Insert out of id order; expect id-sorted output.
    for (const suffix of ['03', '01', '04', '02']) {
      await repo.create(makeRecord({ id: `${prefix}${suffix}` }));
    }

    const all = await repo.list({ limit: 100 });
    const mine = all.items.filter((r) => r.id.startsWith(prefix)).map((r) => r.id);
    expect(mine).toEqual([`${prefix}01`, `${prefix}02`, `${prefix}03`, `${prefix}04`]);

    // Page exactly through this set's first two; cursor must appear.
    const p1 = await repo.list({ limit: 2, cursor: `${prefix}00` });
    expect(p1.items.map((r) => r.id)).toEqual([`${prefix}01`, `${prefix}02`]);
    expect(p1.nextCursor).toBe(`${prefix}02`);
  });

  it('chunked blob 600 KB round-trips byte-identical; kinds independent', async () => {
    const store = createFirestoreBlobStore(client);
    const id = `DMJ-BL-${rnd()}`;
    const cert = pseudoRandomBytes(600 * 1024);
    const s63 = pseudoRandomBytes(120 * 1024);

    await store.put(id, 'certificate', cert);
    await store.put(id, 'section63', s63);

    expect(Buffer.from((await store.get(id, 'certificate'))!).equals(Buffer.from(cert))).toBe(true);
    expect(Buffer.from((await store.get(id, 'section63'))!).equals(Buffer.from(s63))).toBe(true);
    expect(await store.get(`DMJ-BL-${rnd()}`, 'certificate')).toBeNull();

    // Re-put certificate smaller; must not leave a stale tail or disturb s63.
    const small = pseudoRandomBytes(50 * 1024);
    await store.put(id, 'certificate', small);
    const got = await store.get(id, 'certificate');
    expect(got?.byteLength).toBe(small.byteLength);
    expect(Buffer.from(got!).equals(Buffer.from(small))).toBe(true);
    expect(Buffer.from((await store.get(id, 'section63'))!).equals(Buffer.from(s63))).toBe(true);
  });

  it('log append optimistic concurrency: stale second append throws, chain stays linear', async () => {
    // Fresh database namespace via a fresh client/project for a clean chain.
    const isolated = createFirestore({
      GCP_PROJECT_ID: `data-log-${rnd()}`,
      FIRESTORE_DATABASE_ID: '(default)',
      FIRESTORE_EMULATOR_HOST: EMULATOR,
    });
    try {
      const repo = createFirestoreLogRepository(isolated);
      expect(await repo.getHead()).toBeNull();

      const g = makeLeafAndHead(1, 'c1', null);
      expect(g.head.prevHeadHash).toBe(GENESIS_HEAD_HASH);
      await repo.appendLeaf(g.leaf, g.head);
      expect((await repo.getHead())?.seq).toBe(1);

      const headBefore = await repo.getHead();
      const a = makeLeafAndHead(2, 'cA', headBefore);
      const b = makeLeafAndHead(2, 'cB', headBefore);
      await repo.appendLeaf(a.leaf, a.head);
      // Stale loser → transient, retryable LOG_CONFLICT (head moved under it).
      await expect(repo.appendLeaf(b.leaf, b.head)).rejects.toMatchObject({
        code: 'LOG_CONFLICT',
      });

      expect(await repo.getHead()).toEqual(a.head);
      expect(await repo.getLeaf(2)).toEqual(a.leaf);
      expect(await repo.getLeafByCredential('cB')).toBeNull();

      const c = makeLeafAndHead(3, 'c3', a.head);
      await repo.appendLeaf(c.leaf, c.head);
      const list = await repo.listLeaves(1, 3);
      expect(list.map((l) => l.seq)).toEqual([1, 2, 3]);
    } finally {
      await isolated.terminate();
    }
  });

  it('audit verify() true for untampered chain, links to genesis', async () => {
    const isolated = createFirestore({
      GCP_PROJECT_ID: `data-audit-${rnd()}`,
      FIRESTORE_DATABASE_ID: '(default)',
      FIRESTORE_EMULATOR_HOST: EMULATOR,
    });
    try {
      const log = createFirestoreAuditLog(isolated);
      const e1 = await log.append({ actor: 'admin', action: 'issue', subject: 'c1' });
      const e2 = await log.append({ actor: 'public', action: 'verify', requestId: 'r1' });
      expect(e1.prevHash).toBe(GENESIS_HEAD_HASH);
      expect(e2.prevHash).toBe(e1.hash);
      expect(await log.verify()).toBe(true);
    } finally {
      await isolated.terminate();
    }
  });

  it('anchor + admin round-trip with optional-field omission', async () => {
    const anchors = createFirestoreAnchorRepository(client);
    const seq = Number(`${rnd()}`);
    await anchors.save({
      headSeq: seq,
      headHash: 'h'.repeat(64),
      opentimestamps: { otsBase64: 'b64', status: 'pending' },
      anchoredAt: '2026-06-04T10:00:00.000Z',
    });
    const fetched = await anchors.forHead(seq);
    expect(fetched?.opentimestamps).toEqual({ otsBase64: 'b64', status: 'pending' });
    expect(fetched && 'github' in fetched).toBe(false);

    const admin = createFirestoreAdminRepository(client);
    await admin.save({
      id: 'main',
      webauthnCredentials: [],
      recoveryCodeHashes: ['$argon2id$h'],
      failureCount: 0,
      createdAt: '2026-06-04T10:00:00.000Z',
      updatedAt: '2026-06-04T10:00:00.000Z',
    });
    const got = await admin.get();
    expect(got?.id).toBe('main');
    expect(got && 'lockedUntil' in got).toBe(false);
    expect(got && 'totpSecretEnc' in got).toBe(false);
  });
});

function rnd(): string {
  return Math.random().toString(36).slice(2, 8);
}

function pseudoRandomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  let x = 0x12345678;
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    out[i] = x & 0xff;
  }
  return out;
}
