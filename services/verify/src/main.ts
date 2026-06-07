/**
 * Verify service composition root (orchestrator-owned).
 *
 * Wires the concrete keyless crypto verifiers + the Firestore data layer into
 * {@link createVerifyApp} and serves it. Holds NO private key and never the
 * master key — only the public verification material the issuer published.
 */

import { serve } from '@hono/node-server';
import { pino } from 'pino';
import { loadEnv } from '@dmjone/shared';
import { createFirestoreStores, createInMemoryStores } from '@dmjone/data';
import { createLogVerifier, createPasswordHasher, createSignatureVerifier } from '@dmjone/crypto';
import { createVerifyApp } from './app.js';
import { loadVerifyingKeys, type VerifyKeyMaterial } from './runtime/keys.js';

const KEY_LOAD_ATTEMPTS = 5;
const KEY_LOAD_DELAY_MS = 2_000;

async function loadKeysWithRetry(
  load: () => Promise<VerifyKeyMaterial>,
  log: { warn: (obj: object, msg?: string) => void },
): Promise<VerifyKeyMaterial> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await load();
    } catch (err) {
      if (attempt >= KEY_LOAD_ATTEMPTS) throw err;
      // The issuer may not have provisioned the public keys yet (deploy order).
      log.warn({ attempt }, 'public key material not ready; retrying');
      await new Promise((r) => setTimeout(r, KEY_LOAD_DELAY_MS));
    }
  }
}

async function main(): Promise<void> {
  // Local dev/preview: load a gitignored .env before validation. In Cloud Run
  // there is no .env (env is injected) and loadEnvFile throws — ignore it.
  try {
    process.loadEnvFile();
  } catch {
    /* no .env present — using the injected environment */
  }
  const env = loadEnv();
  const logger = pino({ level: env.LOG_LEVEL });
  const stores = env.DATA_BACKEND === 'memory' ? createInMemoryStores() : createFirestoreStores(env);

  const { verifyingKeys, padesFingerprint } = await loadKeysWithRetry(
    () => loadVerifyingKeys(stores.secrets),
    logger,
  );

  // verify builds its own timing-equalisation dummy from env.ARGON2_* at app
  // construction (matches the params real records are hashed under).
  const app = createVerifyApp({
    env,
    logger,
    credentialRepo: stores.credentials,
    blobStore: stores.blobs,
    logRepo: stores.log,
    anchorRepo: stores.anchors,
    auditLog: stores.audit,
    verifier: createSignatureVerifier(verifyingKeys),
    logVerifier: createLogVerifier(verifyingKeys.logMldsaPublicKey),
    passwordHasher: createPasswordHasher({
      memoryKiB: env.ARGON2_MEMORY_KIB,
      iterations: env.ARGON2_ITERATIONS,
      parallelism: env.ARGON2_PARALLELISM,
    }),
    trustedPadesCertFingerprint: padesFingerprint,
  });

  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info({ port: info.port, role: 'verify' }, 'verify service listening');
  });
}

main().catch((err: unknown) => {
  process.stderr.write(`verify failed to start: ${String(err)}\n`);
  process.exit(1);
});
