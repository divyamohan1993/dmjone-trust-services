import { describe, expect, it } from 'vitest';
import { createInMemorySecretStore } from '../src/in-memory/secret-store.js';

describe('in-memory SecretStore', () => {
  it('returns null for an unset secret', async () => {
    const store = createInMemorySecretStore();
    expect(await store.get('master-key')).toBeNull();
  });

  it('round-trips set → get', async () => {
    const store = createInMemorySecretStore();
    await store.set('master-key', 'ciphertext-abc');
    expect(await store.get('master-key')).toBe('ciphertext-abc');
  });

  it('latest set wins (versioning is opaque, only latest observable)', async () => {
    const store = createInMemorySecretStore();
    await store.set('signing-key', 'v1');
    await store.set('signing-key', 'v2');
    expect(await store.get('signing-key')).toBe('v2');
  });

  it('keeps distinct names independent', async () => {
    const store = createInMemorySecretStore();
    await store.set('a', '1');
    await store.set('b', '2');
    expect(await store.get('a')).toBe('1');
    expect(await store.get('b')).toBe('2');
  });
});
