/**
 * Issuer service composition root (orchestrator-owned).
 *
 * Wires the concrete crypto (signing), data (Firestore), and render (Chromium)
 * implementations into {@link createIssuerApp} and serves it. This is the ONLY
 * place the signing keys live in memory. The render factory wiring is confirmed
 * against @dmjone/render's exported seam at integration/build time.
 */

import { serve } from '@hono/node-server';
import { pino } from 'pino';
import { loadEnv } from '@dmjone/shared';
import { createFirestoreStores, createInMemoryStores } from '@dmjone/data';
import {
  createAnchorPublisher,
  createHybridSigner,
  createLogSigner,
  createPasswordHasher,
  createStatusSigner,
} from '@dmjone/crypto';
import { createCertificateRenderer, createSection63Generator } from '@dmjone/render';
import { createIssuerApp } from './app.js';
import { provisionIssuerKeys } from './runtime/keys.js';
import { buildSecretSealer, resolveMasterKey } from './runtime/bootstrap.js';
import type { AnchorPublisherConfig } from '@dmjone/crypto';

async function main(): Promise<void> {
  // Local dev/preview: load a gitignored .env into process.env before validation.
  // In Cloud Run there is no .env (env is injected) and loadEnvFile throws — ignore.
  // Real env vars always win (Node does not overwrite existing process.env).
  try {
    process.loadEnvFile();
  } catch {
    /* no .env present — using the injected environment */
  }
  const env = loadEnv();
  const logger = pino({ level: env.LOG_LEVEL });
  const stores = env.DATA_BACKEND === 'memory' ? createInMemoryStores() : createFirestoreStores(env);

  // The signing keys exist in memory only here, in the key-holding service.
  const masterKey = resolveMasterKey(env, (m) => logger.warn(m));
  const { signingKeys, logSecretKey } = await provisionIssuerKeys(stores.secrets, masterKey);

  // Conditional anchor config — exactOptionalPropertyTypes forbids passing
  // `undefined` to optional fields, so include them only when set.
  const anchorConfig: AnchorPublisherConfig = { otsEnabled: env.ANCHOR_OPENTIMESTAMPS_ENABLED };
  if (env.ANCHOR_GITHUB_REPO) anchorConfig.githubRepo = env.ANCHOR_GITHUB_REPO;
  if (env.ANCHOR_GITHUB_TOKEN) anchorConfig.githubToken = env.ANCHOR_GITHUB_TOKEN;

  const app = createIssuerApp({
    env,
    logger,
    credentialRepo: stores.credentials,
    blobStore: stores.blobs,
    logRepo: stores.log,
    anchorRepo: stores.anchors,
    adminRepo: stores.admin,
    auditLog: stores.audit,
    secretStore: stores.secrets,
    signer: createHybridSigner(signingKeys, env.TSA_URL ? { tsa: { url: env.TSA_URL } } : undefined),
    logSigner: createLogSigner(logSecretKey),
    // Status assertions reuse the credential ML-DSA key; the domain tag in the
    // signed payload keeps that reuse safe (see @dmjone/crypto status.ts).
    statusSigner: createStatusSigner(signingKeys.mldsaSecretKey),
    anchorPublisher: createAnchorPublisher(anchorConfig),
    passwordHasher: createPasswordHasher({
      memoryKiB: env.ARGON2_MEMORY_KIB,
      iterations: env.ARGON2_ITERATIONS,
      parallelism: env.ARGON2_PARALLELISM,
    }),
    renderer: createCertificateRenderer(),
    section63: createSection63Generator(),
    secretSealer: buildSecretSealer(masterKey),
  });

  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info({ port: info.port, role: 'issuer' }, 'issuer service listening');
  });
}

main().catch((err: unknown) => {
  process.stderr.write(`issuer failed to start: ${String(err)}\n`);
  process.exit(1);
});
