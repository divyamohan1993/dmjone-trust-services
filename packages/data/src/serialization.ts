/**
 * Boundary serialization helpers shared by both the Firestore and in-memory
 * persistence implementations.
 *
 * Firestore stores plain JSON-serializable values only, so binary PDF chunks
 * cross the boundary as base64 strings. Keeping the conversion in one place
 * guarantees the two implementations behave identically (the in-memory store
 * round-trips through the same encode/decode so a base64 bug surfaces in tests
 * that never touch GCP).
 */

import { createHash } from 'node:crypto';
import { canonicalJson, type AuditEvent } from '@dmjone/shared';

/** Encode raw bytes to a base64 string (the Firestore at-rest representation). */
export function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

/** Decode a base64 string back to bytes. */
export function base64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

/**
 * Concatenate ordered byte chunks into a single Uint8Array. Used to reassemble
 * a chunked blob after reading its subcollection in order.
 */
export function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * Split raw bytes into fixed-size chunks (the last chunk is the remainder).
 * `chunkSize` must be > 0. An empty input yields a single empty chunk so the
 * round-trip is total (an empty PDF still produces exactly one document).
 */
export function splitIntoChunks(bytes: Uint8Array, chunkSize: number): Uint8Array[] {
  if (chunkSize <= 0) throw new RangeError('chunkSize must be > 0');
  if (bytes.byteLength === 0) return [new Uint8Array(0)];
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    chunks.push(bytes.subarray(offset, Math.min(offset + chunkSize, bytes.byteLength)));
  }
  return chunks;
}

/**
 * The canonical byte string an audit event's hash is taken over. EVERY field
 * except `hash` participates (including `prevHash`), via the shared
 * deterministic JSON serializer. `append` and `verify` MUST derive the hash
 * from this single function, or `verify()` would always fail.
 */
export function auditEventCanonical(event: Omit<AuditEvent, 'hash'>): string {
  return canonicalJson({
    id: event.id,
    at: event.at,
    actor: event.actor,
    action: event.action,
    subject: event.subject ?? null,
    requestId: event.requestId ?? null,
    prevHash: event.prevHash,
    meta: event.meta ?? null,
  });
}

/** SHA-256 (hex) of a UTF-8 string. The audit chain link hash. */
export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Compute an audit event's link hash from its canonical (hash-excluded) form. */
export function auditEventHash(event: Omit<AuditEvent, 'hash'>): string {
  return sha256Hex(auditEventCanonical(event));
}
