/**
 * In-memory {@link AuditLog}. Tamper-evident, hash-chained: each event's `hash`
 * is SHA-256 over the canonical form of every field except `hash` (including
 * `prevHash`), via the shared {@link auditEventHash}. The first event chains to
 * GENESIS_HEAD_HASH. `verify()` walks the chain re-deriving each link with the
 * SAME function used on append, so any altered field or broken link → false.
 *
 * Appends are serialized on the previous event's hash. In a single-process
 * in-memory store this is naturally sequential; the structure still records the
 * prev→hash linkage that makes tampering detectable.
 *
 * `_backing` is an injectable storage array used ONLY by tests to simulate
 * at-rest tampering (mutate a persisted event, then assert verify() === false).
 * Production callers never pass it.
 */

import { GENESIS_HEAD_HASH, type AuditEvent, type AuditLog } from '@dmjone/shared';
import { auditEventHash } from '../serialization.js';

export function createInMemoryAuditLog(_backing: AuditEvent[] = []): AuditLog {
  const events = _backing;
  let seq = events.length;

  return {
    async append(
      input: Omit<AuditEvent, 'id' | 'prevHash' | 'hash' | 'at'> & { at?: string },
    ): Promise<AuditEvent> {
      const prevHash =
        events.length === 0 ? GENESIS_HEAD_HASH : (events[events.length - 1] as AuditEvent).hash;
      seq += 1;

      // Assemble the hash-excluded event, omitting absent optionals so the
      // canonical form matches what verify() will reconstruct.
      const withoutHash: Omit<AuditEvent, 'hash'> = {
        id: String(seq),
        at: input.at ?? new Date().toISOString(),
        actor: input.actor,
        action: input.action,
        prevHash,
      };
      if (input.subject !== undefined) withoutHash.subject = input.subject;
      if (input.requestId !== undefined) withoutHash.requestId = input.requestId;
      if (input.meta !== undefined) withoutHash.meta = input.meta;

      const event: AuditEvent = { ...withoutHash, hash: auditEventHash(withoutHash) };
      events.push(event);
      return structuredClone(event);
    },

    async verify(): Promise<boolean> {
      let expectedPrev = GENESIS_HEAD_HASH;
      for (const event of events) {
        if (event.prevHash !== expectedPrev) return false;
        const { hash, ...rest } = event;
        if (auditEventHash(rest) !== hash) return false;
        expectedPrev = event.hash;
      }
      return true;
    },
  };
}
