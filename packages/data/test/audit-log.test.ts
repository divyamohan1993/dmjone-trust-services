import { describe, expect, it } from 'vitest';
import { GENESIS_HEAD_HASH } from '@dmjone/shared';
import type { AuditEvent } from '@dmjone/shared';
import { createInMemoryAuditLog } from '../src/in-memory/audit-log.js';

describe('in-memory AuditLog (hash-chained)', () => {
  it('chains the first event to genesis and links subsequent events', async () => {
    const log = createInMemoryAuditLog();
    const e1 = await log.append({ actor: 'admin', action: 'issue', subject: 'DMJ-IC-20260604-01' });
    const e2 = await log.append({ actor: 'public', action: 'verify', subject: 'DMJ-IC-20260604-01' });

    expect(e1.prevHash).toBe(GENESIS_HEAD_HASH);
    expect(e2.prevHash).toBe(e1.hash);
    expect(e1.hash).not.toBe(e2.hash);
  });

  it('verify() returns true for an untampered chain (guards serializer parity)', async () => {
    const log = createInMemoryAuditLog();
    await log.append({ actor: 'admin', action: 'issue' });
    await log.append({ actor: 'public', action: 'verify', subject: 'x', requestId: 'req-1' });
    await log.append({ actor: 'system', action: 'anchor', meta: { headSeq: 3 } });
    expect(await log.verify()).toBe(true);
  });

  it('preserves optional fields through hashing and omits absent ones', async () => {
    const log = createInMemoryAuditLog();
    const withMeta = await log.append({
      actor: 'system',
      action: 'anchor',
      requestId: 'req-9',
      meta: { headSeq: 1, repo: 'dmjone/anchors' },
    });
    expect(withMeta.requestId).toBe('req-9');
    expect(withMeta.meta).toEqual({ headSeq: 1, repo: 'dmjone/anchors' });

    const minimal = await log.append({ actor: 'admin', action: 'login' });
    expect('subject' in minimal).toBe(false);
    expect('requestId' in minimal).toBe(false);
    expect('meta' in minimal).toBe(false);
    expect(await log.verify()).toBe(true);
  });

  it('uses the caller-supplied timestamp when provided', async () => {
    const log = createInMemoryAuditLog();
    const e = await log.append({ actor: 'admin', action: 'issue', at: '2026-01-01T00:00:00.000Z' });
    expect(e.at).toBe('2026-01-01T00:00:00.000Z');
  });

  it('verify() catches a tampered event field at rest', async () => {
    // Inject a backing array so we can mutate persisted bytes like an attacker
    // with DB access, then re-run verify().
    const backing: AuditEvent[] = [];
    const log = createInMemoryAuditLog(backing);
    await log.append({ actor: 'admin', action: 'issue', subject: 'DMJ-IC-20260604-01' });
    await log.append({ actor: 'admin', action: 'revoke', subject: 'DMJ-IC-20260604-01' });
    expect(await log.verify()).toBe(true);

    // Tamper: flip the action of the first event without recomputing its hash.
    const first = backing[0] as AuditEvent;
    first.action = 'forged-action';
    expect(await log.verify()).toBe(false);
  });

  it('verify() catches a broken prevHash link at rest', async () => {
    const backing: AuditEvent[] = [];
    const log = createInMemoryAuditLog(backing);
    await log.append({ actor: 'admin', action: 'issue' });
    await log.append({ actor: 'admin', action: 'revoke' });
    expect(await log.verify()).toBe(true);

    // Break the link from event 2 back to event 1.
    (backing[1] as AuditEvent).prevHash = 'f'.repeat(64);
    expect(await log.verify()).toBe(false);
  });
});
