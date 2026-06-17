import { describe, expect, it } from 'vitest';
import { PDF_CHUNK_SIZE_BYTES } from '@dmjone/shared';
import { createInMemoryBlobStore } from '../src/in-memory/blob-store.js';

function pseudoRandomBytes(n: number): Uint8Array {
  // Deterministic, non-trivial byte pattern so a chunk-boundary bug shows up.
  const out = new Uint8Array(n);
  let x = 0x12345678;
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    out[i] = x & 0xff;
  }
  return out;
}

describe('in-memory BlobStore (chunked, per-kind)', () => {
  it('round-trips a 600 KB certificate byte-identically across many chunks', async () => {
    const store = createInMemoryBlobStore();
    const size = 600 * 1024; // > 2 chunks at 256 KiB
    const bytes = pseudoRandomBytes(size);

    await store.put('DMJ-IC-20260604-01', 'certificate', bytes);
    const out = await store.get('DMJ-IC-20260604-01', 'certificate');

    expect(out).not.toBeNull();
    expect(out?.byteLength).toBe(size);
    expect(Buffer.from(out!).equals(Buffer.from(bytes))).toBe(true);
    // Sanity: this really did span multiple chunks.
    expect(size).toBeGreaterThan(PDF_CHUNK_SIZE_BYTES * 2);
  });

  it('returns null for an unknown credential or unset kind', async () => {
    const store = createInMemoryBlobStore();
    expect(await store.get('DMJ-IC-20260604-99', 'certificate')).toBeNull();
    await store.put('c', 'certificate', pseudoRandomBytes(10));
    // certificate is set, section63 is not.
    expect(await store.get('c', 'section63')).toBeNull();
  });

  it('keeps the two kinds independent for the same credential', async () => {
    const store = createInMemoryBlobStore(16);
    const cert = pseudoRandomBytes(40);
    const s63 = pseudoRandomBytes(24);
    await store.put('c', 'certificate', cert);
    await store.put('c', 'section63', s63);

    expect(Buffer.from((await store.get('c', 'certificate'))!).equals(Buffer.from(cert))).toBe(true);
    expect(Buffer.from((await store.get('c', 'section63'))!).equals(Buffer.from(s63))).toBe(true);

    // Re-putting one kind smaller must not disturb the other.
    const certSmall = pseudoRandomBytes(8);
    await store.put('c', 'certificate', certSmall);
    expect(Buffer.from((await store.get('c', 'certificate'))!).equals(Buffer.from(certSmall))).toBe(
      true,
    );
    expect(Buffer.from((await store.get('c', 'section63'))!).equals(Buffer.from(s63))).toBe(true);
  });

  it('round-trips an exact-multiple-of-chunk-size buffer', async () => {
    const store = createInMemoryBlobStore(16);
    const bytes = pseudoRandomBytes(48); // exactly 3 chunks of 16
    await store.put('c', 'certificate', bytes);
    const out = await store.get('c', 'certificate');
    expect(Buffer.from(out!).equals(Buffer.from(bytes))).toBe(true);
  });

  it('round-trips an empty buffer', async () => {
    const store = createInMemoryBlobStore();
    await store.put('empty', 'certificate', new Uint8Array(0));
    const out = await store.get('empty', 'certificate');
    expect(out?.byteLength).toBe(0);
  });

  it('overwrites without leaving a stale tail when re-put smaller', async () => {
    const store = createInMemoryBlobStore(16);
    await store.put('c', 'certificate', pseudoRandomBytes(80)); // 5 chunks
    const small = pseudoRandomBytes(20); // 2 chunks
    await store.put('c', 'certificate', small);
    const out = await store.get('c', 'certificate');
    expect(out?.byteLength).toBe(20);
    expect(Buffer.from(out!).equals(Buffer.from(small))).toBe(true);
  });

  // ── WS2-A erasure: purge a stored blob ────────────────────────────────────
  it('delete purges a stored blob (get → null afterwards)', async () => {
    const store = createInMemoryBlobStore();
    await store.put('c', 'certificate', pseudoRandomBytes(40));
    expect(await store.get('c', 'certificate')).not.toBeNull();

    await store.delete('c', 'certificate');
    expect(await store.get('c', 'certificate')).toBeNull();
  });

  it('delete is idempotent (no-op on an absent blob)', async () => {
    const store = createInMemoryBlobStore();
    // Never put anything; deleting must not throw.
    await expect(store.delete('never', 'certificate')).resolves.toBeUndefined();
    // Delete twice on a real blob.
    await store.put('c', 'section63', pseudoRandomBytes(10));
    await store.delete('c', 'section63');
    await expect(store.delete('c', 'section63')).resolves.toBeUndefined();
    expect(await store.get('c', 'section63')).toBeNull();
  });

  it('delete removes only the named kind, leaving the other intact', async () => {
    const store = createInMemoryBlobStore(16);
    const cert = pseudoRandomBytes(40);
    const s63 = pseudoRandomBytes(24);
    await store.put('c', 'certificate', cert);
    await store.put('c', 'section63', s63);

    await store.delete('c', 'certificate');
    expect(await store.get('c', 'certificate')).toBeNull();
    // section63 untouched.
    expect(Buffer.from((await store.get('c', 'section63'))!).equals(Buffer.from(s63))).toBe(true);
  });
});
