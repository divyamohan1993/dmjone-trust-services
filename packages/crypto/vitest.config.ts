import { defineConfig } from 'vitest/config';

/**
 * The crypto suite runs genuinely heavy primitives — RSA-3072 keygen, Argon2id
 * at production cost (~5s a derivation), and ML-DSA over real PDFs. Vitest's
 * default 5s per-test timeout sits right on top of those, so a single test can
 * spuriously time out when the machine is under load (e.g. a typecheck running
 * alongside). Raise the timeouts well clear of the real work so a failure always
 * means a real failure, never contention. (Correctness, not a workaround: none
 * of these tests should ever legitimately approach 30s.)
 */
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
