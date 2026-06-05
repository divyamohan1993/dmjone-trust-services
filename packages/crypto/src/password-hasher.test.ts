import { ARGON2_DEFAULTS } from '@dmjone/shared';
import { describe, expect, it } from 'vitest';
import { createPasswordHasher } from './password-hasher.js';

// Low cost params keep the suite fast; the encoding/round-trip behaviour is
// identical to production cost. One test exercises the real ARGON2_DEFAULTS.
const FAST = { memoryKiB: 256, iterations: 1, parallelism: 1 } as const;

describe('createPasswordHasher (Argon2id)', () => {
  it('hashes to a self-describing argon2id PHC string and verifies', async () => {
    const hasher = createPasswordHasher(FAST);
    const stored = await hasher.hash('correct horse battery staple');

    expect(stored).toMatch(
      /^\$argon2id\$v=19\$m=256,t=1,p=1\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/,
    );
    expect(await hasher.verify('correct horse battery staple', stored)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hasher = createPasswordHasher(FAST);
    const stored = await hasher.hash('s3cret-pw');
    expect(await hasher.verify('wrong-pw', stored)).toBe(false);
    expect(await hasher.verify('s3cret-pw ', stored)).toBe(false); // trailing space
    expect(await hasher.verify('', stored)).toBe(false);
  });

  it('produces a unique salt per hash, yet both verify (no determinism leak)', async () => {
    const hasher = createPasswordHasher(FAST);
    const a = await hasher.hash('same-password');
    const b = await hasher.hash('same-password');
    expect(a).not.toBe(b); // random salt → different stored strings
    expect(await hasher.verify('same-password', a)).toBe(true);
    expect(await hasher.verify('same-password', b)).toBe(true);
  });

  it('verifies across independent instances using the embedded params (issuer↔verify)', async () => {
    // Issue-time instance hashes; a *different* download-time instance verifies.
    const issuer = createPasswordHasher(FAST);
    const stored = await issuer.hash('candidate-pw');

    // The verify-side hasher even has different *default* cost params; it must
    // still verify because it uses the params embedded in the stored PHC string.
    const verify = createPasswordHasher({ memoryKiB: 1024, iterations: 2, parallelism: 2 });
    expect(await verify.verify('candidate-pw', stored)).toBe(true);
    expect(await verify.verify('nope', stored)).toBe(false);
  });

  it('returns false (never throws) for malformed stored values', async () => {
    const hasher = createPasswordHasher(FAST);
    for (const bad of [
      '',
      'not-a-phc-string',
      '$argon2id$v=19$m=256,t=1,p=1$onlysalt', // missing hash segment
      '$bcrypt$v=19$m=256,t=1,p=1$c2FsdA$aGFzaA', // wrong algorithm
      '$argon2id$v=18$m=256,t=1,p=1$c2FsdA$aGFzaA', // unsupported version
      '$argon2id$v=19$m=abc,t=1,p=1$c2FsdA$aGFzaA', // non-numeric param
      '$argon2id$v=19$m=256,t=1$c2FsdA$aGFzaA', // too few params
    ]) {
      expect(await hasher.verify('whatever', bad)).toBe(false);
    }
  });

  it('embeds the configured cost parameters in the PHC string', async () => {
    const hasher = createPasswordHasher({ memoryKiB: 512, iterations: 2, parallelism: 3 });
    const stored = await hasher.hash('pw');
    expect(stored).toContain('$m=512,t=2,p=3$');
  });

  it('works with the production ARGON2_DEFAULTS cost parameters', async () => {
    const hasher = createPasswordHasher(ARGON2_DEFAULTS);
    const stored = await hasher.hash('production-grade');
    expect(stored).toContain(
      `$m=${ARGON2_DEFAULTS.memoryKiB},t=${ARGON2_DEFAULTS.iterations},p=${ARGON2_DEFAULTS.parallelism}$`,
    );
    expect(await hasher.verify('production-grade', stored)).toBe(true);
    expect(await hasher.verify('wrong', stored)).toBe(false);
  });
});
