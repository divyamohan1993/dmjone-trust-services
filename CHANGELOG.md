# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Security

- 2026-06-08: **Issuer CSP gains `frame-src 'self' blob:`** so the admin can frame the
  same-origin `blob:` PDF of the exact pre-issue preview. Minimal widening — blob URLs
  are same-origin and only script-creatable, and script is already nonce-gated;
  `X-Frame-Options: DENY` is unchanged (it does not gate a client-created `blob:` frame).
- 2026-06-07: **Crypto strength raised to NIST Level 5.** Credential + transparency-
  log signatures upgraded from ML-DSA-65 (L3) to **ML-DSA-87** (FIPS 204, Level 5,
  ~AES-256 quantum security). Argon2id download-password hashing raised to 32 MiB /
  t=3 (from 19 MiB / t=2 — pure-JS budget keeps it below 64 MiB). All keys
  regenerated at full CSPRNG entropy (no certificates issued prior, so the
  re-provision is clean). The classical PAdES PKCS#7 layer (RSA → ECDSA P-521) and
  the Secret-Manager → Cloud Run / Firestore secret move follow as the next step.
- 2026-06-07: **All deploy-time secrets remain in Secret Manager** (`master-encryption-key`,
  `session-secret`, `admin-setup-token`). An attempt to move `session-secret`/`admin-setup-token`
  to Cloud Run env vars was reverted after a security review flagged that
  `SESSION_SECRET` forges admin sessions — like the master key, it must stay out
  of the CI/config path. (The env-var deploy had already failed on the
  secret→literal transition, so nothing insecure went live.) The Secret-Manager
  cost cut will instead come from moving the **sealed/public signing keys** to
  Firestore (no security downgrade), with the 512/384-bit entropy bump and the
  ECDSA P-521 layer, as a focused next step.

### Added

- 2026-06-08: **Phase 2C — the three-mode admin console (completes Trusted Documents).** The
  issuer dashboard is now a tabbed console: **Certificate · Letterhead · Upload**. Certificate
  gains a free-text type (datalist of the five presets) on the existing ornamental template +
  rich editor. **Letterhead** reuses the rich body editor for a long letter (reference, recipient
  block, subject, salutation, body, valediction) with live preview + issue. **Upload**: pick a
  PDF → inspect → drag-and-resize your handwritten signature on a page-accurate canvas → preview
  the exact stamped result → "Sign & download" the PAdES + ML-DSA attested file (named by its
  document number). All inside the one nonce'd, dependency-free IIFE; CSP unchanged (drag via
  CSSOM, no inline styles); WCAG-friendly tablist + keyboard-operable placement. This finishes
  the three-mode dmj.one Trusted Documents system end-to-end (author/upload → sign → verify).
- 2026-06-08: **Phase 2B (backend) — letterhead + upload issuance, kind-aware verification.**
  New issuer routes: `POST /api/letters` (+ side-effect-free `/api/letters/preview`) issues a
  letterhead letter as a verified Trusted Document; `POST /api/uploads/inspect`, `/api/uploads/preview`,
  and `/api/uploads` ingest a PDF, stamp a per-page validation-ID QR (+ optional placed handwritten
  signature), then PAdES + ML-DSA + transparency-log attest it (id allocated BEFORE stamping so the
  QR resolves; signed bytes returned with an `X-Document-Id`). The public verify page and the BSA §63
  certificate are now kind-aware (`documentKind`): letters show subject/recipient, uploads show the
  document number, original filename, original SHA-256, and page count with honest "dmj.one attests it
  signed this document; the content is the uploader's" copy. Certificate page + §63 stay byte-identical.
  The browser console for the new modes follows. Contract: `docs/specs/2026-06-08-trusted-documents-modes.md`.
- 2026-06-08: **Phase 2A — render layer for letterhead + uploads, and custom certificate
  types.** `@dmjone/render` gains `buildLetterHtml` (a flowing, multi-page dmj.one
  letterhead with the rich body), `renderer.renderLetter`, `stampAttestation` (pure
  pdf-lib: a per-page validation-ID QR + caption in the page margin, plus an optional
  placed/resized handwritten-signature image — saved with a CLASSIC xref table so the
  PAdES signer accepts it), and `inspectPdf` (page count + sizes for the placement UI).
  Certificates may now use a **custom free-text type** (not only the five presets) via
  `credentialTypeCode` / `labelForType`; preset codes, labels, and ids are byte-identical,
  and render/verify/§63 derive labels through the helper (custom types → Title-Cased).
  Render layer + schema only; the issuer routes, verify-page variants, and 3-mode console
  follow in Phase 2B. Contract: `docs/specs/2026-06-08-trusted-documents-modes.md`.
- 2026-06-08: **Trusted-documents foundation** (Phase 1 of a 3-mode issuer:
  certificate / letterhead / upload-&-attest). Generalized the record with a
  `kind` discriminator (`certificate | letter | upload`; absent ⇒ certificate, so
  stored data is unchanged), added `LetterContent` / `UploadAttestation` /
  `SignaturePlacement` types, per-kind canonical signing payloads
  (`computeLetterCanonicalPayload` / `computeUploadCanonicalPayload` /
  `computeCanonicalPayloadForRecord`), and decoupled the hybrid signer to
  `sign(unsignedPdf, buildCanonicalPayload)` so all kinds share one crypto
  backbone. The **certificate canonical payload is frozen byte-for-byte**, guarded
  by a golden-vector test, so every already-issued certificate still verifies
  (proven end-to-end through real ML-DSA-87 + PAdES). Verify recomputes by kind via
  `verifyMldsaForRecord`. Foundation only; the per-mode routes/templates/UI follow.
  Contract: `docs/specs/2026-06-08-trusted-documents-foundation.md`.
- 2026-06-08: **Rich-text certificate body + exact pre-issue preview.** The issue form's
  body is now a live "type-inside-the-render" editor: per-run **Bold** / *Italic* /
  _Underline_ (in-band `**`/`*`/`__` markup compiled by a real tokenizer with a
  CommonMark crossing rule, so malformed/interleaved input degrades to literal text and
  never to broken or unsafe HTML) and per-line alignment (Left / Center / Right /
  Justify via four `pa-*` classes; the default stays justify). A strict DOM serializer
  is the trust boundary — only text + `<strong>/<em>/<u>` survive, so pasted markup or
  scripts can never leave the browser. New `POST /api/credentials/preview` renders the
  exact Chromium signing output — provably side-effect-free (no id allocation, signing,
  log append, blob store, or audit) — into an embedded `blob:` PDF viewer, so issuance
  is never blind. The certificate canonical signing payload, shared schemas, and types
  are unchanged, so every already-issued certificate still verifies byte-identically.
  Frozen contract: `docs/specs/2026-06-07-body-rich-text-contract.md`.
- 2026-06-07: **Shared web design system + self-hosted brand fonts** ("The Sealed
  Instrument"). `@dmjone/brand` now exports `designSystemCss()` — one CSP-safe
  stylesheet (the gold double-frame, three-tier verdict, sober §63 register, and
  the `@font-face` block) so both services render in the dmj.one fonts and never
  drift from the printed PDF. The eight latin-subset woff2 weights are
  base64-embedded into a per-service `src/fonts/font-bytes.ts` (generated by
  `scripts/gen-font-bytes.mjs`) and served from a new in-memory
  `GET /fonts/:file` route on both verify and issuer (`font/woff2`,
  `Cache-Control: public, max-age=31536000, immutable`, the map itself the
  allow-list — no path traversal, no CDN, no Dockerfile change). Added
  `font-src 'self'` to the verify CSP (issuer already had it). Page markup is
  unchanged for now.

### Fixed

- 2026-06-07: Bare domains no longer return a raw 404. `verify.dmj.one/` now
  serves a branded "verify by credential ID" landing (`/?id=…` redirects to
  `/c/:id`); `issue.dmj.one/` redirects to `/admin`.

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

- 2026-06-07: **Issuer admin UI redesigned to "The Sealed Instrument".** The
  issuer's shared shell (`services/issuer/src/ui/layout.ts`) now renders the
  `@dmjone/brand` `designSystemCss()` (light-only, cream paper, gold double-frame
  + diamond studs) instead of the old dark `system-ui` theme, so the admin
  surface matches the public verify surface and the printed PDF. The four
  inline `style="flex:1 1 12rem"` divs in the issuance form are folded into the
  CSP-safe `.field-half` utility (no `style=""` attribute survives anywhere).
  Sign-in / bootstrap is dressed as the ornamental SEALING ceremony; the
  super-admin panel (`routes/superadmin.ts`) becomes the SOBER §63 court
  instrument (no wash/studs/script) and its DR-snapshot + factory-reset handlers
  now answer a native form post with a branded §63 HTML confirmation page while
  still answering a JSON request with JSON. `@dmjone/brand` added to the issuer's
  dependencies. The verbatim WebAuthn vanilla-JS (`admin-script.ts`), all data
  hooks/ids, the nonce-CSP, the zero-JS super-admin, and the token-bucket-first
  ordering are unchanged. 73 issuer tests green.

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
