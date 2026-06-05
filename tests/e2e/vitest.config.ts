import { defineConfig } from 'vitest/config';

// The e2e exercises real Chromium renders + real Argon2id derivations, which are
// genuinely slow (and slower under concurrent load). Generous ceilings so a
// failure always means a real failure, never a timeout-under-load flake.
export default defineConfig({
  test: {
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
