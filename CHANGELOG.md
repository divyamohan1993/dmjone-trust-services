# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- 2026-06-06: **PAdES-B-T** — best-effort RFC-3161 trusted timestamps embedded in
  the PAdES signature (configured via `TSA_URL`; request format validated live
  against DigiCert, freetsa, and Sectigo). The timestamp is an *unsigned*
  attribute, so it can never invalidate the signature, and a TSA outage degrades
  gracefully to PAdES-B-B. 6 crypto tests; e2e pipeline intact with the enlarged
  signature placeholder.
- 2026-06-06: **Live deployment** to Cloud Run (`asia-east1`, scale-to-zero) —
  issuer + verify, isolated `trust` Firestore DB, images in Artifact Registry,
  Cloud Run domain mappings (the `ghs.googlehosted.com` CNAMEs). Public repo +
  GitHub Actions image build. Live health + Firestore validated in production.

### Changed

- 2026-06-06: Consolidated the issuer key material into TWO Secret Manager
  entries — `trust_public` (plain, what the keyless verify service reads) and
  `trust_private` (AES-256-GCM sealed, issuer-only) — instead of six. Keeps the
  project inside Secret Manager's free tier and tightens the keyless boundary
  (verify no longer reads any private ciphertext).

- 2026-06-05: Approved design spec — dmj.one Trust Services quantum-verifiable
  certificate system (`docs/superpowers/specs/2026-06-05-quantum-certificate-system-design.md`).
- 2026-06-05: Monorepo skeleton (pnpm workspaces), strict TypeScript base config,
  environment contract (`.env.example`), changelog, README.
- 2026-06-05: `@dmjone/crypto` cryptography core — ML-DSA-65 + RSA-3072 PAdES key
  generation, hybrid signer (PAdES PKCS#7 via incremental-update placeholder so
  the rendered bytes are preserved verbatim, + detached ML-DSA over the shared
  canonical payload), signature verifier (ML-DSA + standalone PAdES ByteRange
  integrity check), transparency-log hash chain with Signed Tree Heads (pure
  `nextHead` + ML-DSA signing), a graceful-degrading external anchor publisher
  (GitHub contents API + OTS stub), and an Argon2id password hasher
  (self-describing PHC strings, constant-time verify) for the gated download
  password. 44 vitest tests; typecheck + tests green.
- 2026-06-05: `@dmjone/data` persistence — in-memory + Firestore/Secret-Manager
  families of every repository (credentials, chunked PDF blobs by kind, the
  transparency log with transactional optimistic-concurrency appends, a
  hash-chained audit log, anchors, admin, secrets). 41 tests (+6 emulator-gated).
- 2026-06-05: `@dmjone/render` — pixel-faithful certificate + BSA-2023 §63
  certificate-of-authenticity rendering via headless Chromium, fonts + images
  inlined as base64 (zero network), raw-Chromium classic-xref output (PAdES-safe).
  44 tests incl. real-Chromium integration.
- 2026-06-05: `@dmjone/verify` — public, keyless verification service: distinct
  web credential page (SSR'd cryptographic verdict), id/file verification with
  1-bit tamper detection, enumeration-safe password-gated download, §63 serving,
  nonce-CSP + full security headers. 52 tests.
- 2026-06-05: `@dmjone/issuer` — admin/issuing service: WebAuthn passkeys + TOTP
  + one-time recovery codes (passkey-vs-recovery lockout split), the issuance
  pipeline (render → hybrid-sign → log-append-with-retry → store → best-effort
  anchor → audit), super-admin panel, server-rendered admin UI. 49 tests.
- 2026-06-05: `@dmjone/brand` design tokens; orchestrator composition roots
  (issuer/verify), AES-256-GCM secret sealing + key provisioning (private keys
  sealed at rest, public material plain for the keyless verifier).
- 2026-06-05: Infrastructure — multi-stage Dockerfiles (Chromium issuer /
  distroless verify), Firestore deny-all rules + indexes, idempotent
  `autoconfig.sh` + Cloud Build, GitHub Actions CI, and `DEPLOY.md` with the
  `ghs.googlehosted.com` domain-mapping runbook (asia-east1, scale-to-zero).
- 2026-06-05: End-to-end test proving the streams compose — real Chromium render
  → hybrid-sign → verify → byte-exact gated download → flip-a-bit tamper
  detection → SSR credential page. Full workspace builds clean; 237 tests green.
- 2026-06-05: Verification hardening — `DATA_BACKEND=memory` local-dev mode (boot
  without GCP), key-provisioning + AES-256-GCM seal/unseal tests (generate-then-
  reload byte-identical), a sample-certificate generator, and a confirmed boot of
  both composition roots (issuer serves `/health`; verify runs to key-load).
  Generated certificate verified pixel-faithful to the reference (incl. bold).
- 2026-06-05: `ADMIN_SETUP_TOKEN` fail-closed bootstrap gate — the first admin
  passkey registration (and re-registration after a factory reset) requires a
  dedicated setup token (timing-safe compare), refused in production if unset.
  Closes the initial land-grab and a stolen-session → reset → durable-admin
  escalation chain (locked by an end-to-end attack-chain regression test).
  Final suite: 259 tests green.
