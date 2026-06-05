import { describe, expect, it } from 'vitest';
import { AppError, GENESIS_HEAD_HASH } from '@dmjone/shared';
import { createInMemoryLogRepository } from '../src/in-memory/log-repository.js';
import { makeLeafAndHead } from './fixtures.js';

describe('in-memory LogRepository (optimistic concurrency)', () => {
  it('starts empty', async () => {
    const repo = createInMemoryLogRepository();
    expect(await repo.getHead()).toBeNull();
    expect(await repo.getLeaf(1)).toBeNull();
  });

  it('appends the first leaf extending genesis and advances the head', async () => {
    const repo = createInMemoryLogRepository();
    const { leaf, head } = makeLeafAndHead(1, 'DMJ-IC-20260604-01', null);
    expect(head.prevHeadHash).toBe(GENESIS_HEAD_HASH);

    await repo.appendLeaf(leaf, head);

    expect(await repo.getHead()).toEqual(head);
    expect(await repo.getLeaf(1)).toEqual(leaf);
    expect(await repo.getLeafByCredential('DMJ-IC-20260604-01')).toEqual(leaf);
  });

  it('CONFLICT: a first head not starting at seq 1 (chain moved / wrong base)', async () => {
    const repo = createInMemoryLogRepository();
    const { leaf, head } = makeLeafAndHead(2, 'x', null); // seq 2 on empty chain
    // Retryable: the caller built on a head that does not exist (yet); re-fetch
    // (still empty) → recompute as seq 1 → retry. Hence LOG_CONFLICT, not failed.
    await expect(repo.appendLeaf(leaf, head)).rejects.toMatchObject({
      code: 'LOG_CONFLICT',
    });
  });

  it('keeps the chain linear and seq monotonic across sequential appends', async () => {
    const repo = createInMemoryLogRepository();
    const a = makeLeafAndHead(1, 'c1', null);
    await repo.appendLeaf(a.leaf, a.head);
    const b = makeLeafAndHead(2, 'c2', a.head);
    await repo.appendLeaf(b.leaf, b.head);
    const c = makeLeafAndHead(3, 'c3', b.head);
    await repo.appendLeaf(c.leaf, c.head);

    const head = await repo.getHead();
    expect(head?.seq).toBe(3);
    expect(head?.prevHeadHash).toBe(b.head.headHash);

    const all = await repo.listLeaves(1, 3);
    expect(all.map((l) => l.seq)).toEqual([1, 2, 3]);
  });

  it('CONFLICT: two appends off the SAME head → second throws LOG_CONFLICT, chain linear', async () => {
    const repo = createInMemoryLogRepository();
    const genesis = makeLeafAndHead(1, 'c1', null);
    await repo.appendLeaf(genesis.leaf, genesis.head);
    const headBefore = await repo.getHead();

    // Two writers both read the same current head (seq 1) and build seq 2.
    const writerA = makeLeafAndHead(2, 'cA', headBefore);
    const writerB = makeLeafAndHead(2, 'cB', headBefore);

    await repo.appendLeaf(writerA.leaf, writerA.head); // wins → head advances to seq 2
    // Writer B's head is now stale: its seq (2) no longer extends stored (2).
    // This is the optimistic-concurrency miss → transient, retryable.
    await expect(repo.appendLeaf(writerB.leaf, writerB.head)).rejects.toBeInstanceOf(AppError);
    await expect(repo.appendLeaf(writerB.leaf, writerB.head)).rejects.toMatchObject({
      code: 'LOG_CONFLICT',
    });

    const head = await repo.getHead();
    expect(head).toEqual(writerA.head);
    // Only writer A's leaf landed at seq 2; the chain never branched.
    expect(await repo.getLeaf(2)).toEqual(writerA.leaf);
    expect(await repo.getLeafByCredential('cB')).toBeNull();
  });

  it('CONFLICT: a non-contiguous seq (gap) is retryable', async () => {
    const repo = createInMemoryLogRepository();
    const a = makeLeafAndHead(1, 'c1', null);
    await repo.appendLeaf(a.leaf, a.head);
    // seq 3 skipping 2 → the head moved differently than the caller assumed.
    const skip = makeLeafAndHead(3, 'c3', a.head);
    await expect(repo.appendLeaf(skip.leaf, skip.head)).rejects.toMatchObject({
      code: 'LOG_CONFLICT',
    });
  });

  it('TERMINAL: an inconsistent leaf+head pair throws LOG_APPEND_FAILED (not retryable)', async () => {
    const repo = createInMemoryLogRepository();
    const a = makeLeafAndHead(1, 'c1', null);
    // Corrupt the pair: leaf.seq (1) != head.seq (2). Re-fetching the head can
    // never repair a caller that assembled mismatched leaf/head → terminal.
    const head = { ...a.head, seq: 2 };
    await expect(repo.appendLeaf(a.leaf, head)).rejects.toMatchObject({
      code: 'LOG_APPEND_FAILED',
    });
  });

  it('returns null leaves outside the stored range', async () => {
    const repo = createInMemoryLogRepository();
    const a = makeLeafAndHead(1, 'c1', null);
    await repo.appendLeaf(a.leaf, a.head);
    expect(await repo.getLeaf(99)).toBeNull();
    expect(await repo.getLeafByCredential('nope')).toBeNull();
    expect(await repo.listLeaves(5, 10)).toEqual([]);
  });
});
