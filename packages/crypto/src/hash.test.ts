import { describe, expect, it } from 'vitest';
import { base64ToBytes, bytesToBase64, sha256Hex, toUtf8Bytes } from './hash.js';

describe('sha256Hex', () => {
  it('matches the known SHA-256 vector for "abc"', () => {
    // FIPS 180-4 example.
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('hashes the empty string to the known digest', () => {
    expect(sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('hashes bytes and the equivalent UTF-8 string identically', () => {
    const bytes = toUtf8Bytes('hello');
    expect(sha256Hex(bytes)).toBe(sha256Hex('hello'));
  });

  it('produces 64 lowercase hex characters', () => {
    const digest = sha256Hex('anything');
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('base64 round-trip', () => {
  it('encodes and decodes bytes losslessly', () => {
    const original = new Uint8Array([0, 1, 2, 250, 251, 255, 128, 64]);
    const b64 = bytesToBase64(original);
    expect(base64ToBytes(b64)).toEqual(original);
  });
});
