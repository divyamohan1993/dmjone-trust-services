# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- 2026-06-15: **Provable, signed revocation (court-admissibility hardening).** A
  credential's status is now backed by a domain-separated, dated ML-DSA-87
  assertion the issuer mints at issue-time and re-mints on every status change
  (`STATUS_ASSERTION_DOMAIN = "dmjone/status/v1"`, signing
  `tag + "\n" + canonicalJson({v,asOf,credentialId,status})`). The domain tag
  makes reusing the credential key for status assertions safe by construction
  (no cross-protocol confusion). New keyless endpoint
  `GET /api/credentials/:id/status` serves the stored signature (legacy records
  → `legacyUnsigned`, never 500; `Cache-Control: public, max-age=60,
  stale-while-revalidate=300`), and the offline evidence bundle now carries a
  checkable `signedStatus` + a verify step. Previously a revoked credential's
  offline bundle passed every embedded check (status was unsigned, uncheckable).
  Verify stays signing-keyless: all signing + writes are issuer-side.
- 2026-06-15: **Court-readiness assessment + zero-cost hardening design.**
  `docs/court-readiness-assessment.md` (two-axis verdict: leading on
  cryptographic integrity, absent on Indian statutory recognition by design) and
  `docs/specs/2026-06-15-zero-cost-court-admissibility-design.md` (4-lens
  adversarially-reviewed plan).

### Changed

- 2026-06-15: **Honest §63 certificate, docs, and a fake removed.** The §63
  Honest Disclosure now also disclaims the **§87 BSA-2023** (Electronic Signature
  Certificate contents) presumption and frames both §86/§87 as **rebuttable**;
  Part B's expert qualification tracks the SC standard ("special skill and
  expertise in computer science and cyber forensics", per *Pune Bar Assn v. UoI*,
  2026 — cited only in a `[VERIFY-WITH-COUNSEL]` code comment, never on the PDF
  face); revoking now re-renders the §63 (best-effort, never blocking the
  revocation) so the downloadable certificate shows "Revoked" + a revocation
  date. README + `HybridSignatureResult`/`HybridSigner` JSDoc corrected
  (ML-DSA-**87** not 65; the delivered PDF embeds **no** signature; identity
  rests on a self-published key). The non-functional OpenTimestamps **stub was
  removed** — no placeholder `.ots` receipt is emitted (it would falsely imply
  Bitcoin anchoring); real OTS is deferred. CI `pnpm audit` is now **fail-closed**
  on high/critical, with a documented, time-boxed `pnpm.auditConfig.ignoreGhsas`
  override (revisit 2026-09-01) for three **dev/build-only** advisories with no
  runtime exposure: crypto-js via the dormant test-only `@signpdf` chain
  (GHSA-xwcq-pm8m-c4vf), vitest `--ui`-server RCE never run in CI/prod
  (GHSA-5xrq-8626-4rwp; real fix = vitest 2→3 major bump, deferred), esbuild via
  `tsx`/`vite` build tooling (GHSA-gv7w-rqvm-qjhr). New advisories still fail CI.

- 2026-06-10: **The real dmj.one logo as the verify portal's favicon.** The
  circular watercolor badge (assets/logo round.png) is resized offline (1500 →
  512 → 32/180 px, high-quality bicubic) and embedded as bytes, served
  same-origin at `/favicon.ico`, `/favicon-32.png` and `/apple-touch-icon.png`
  with `<link>` tags on every page; CSP `img-src` moves from `'none'` to
  `'self'` solely for this (the pages still embed no `<img>`).

### Fixed

- 2026-06-10: **The lookup never bounces silently again, and the upload gate
  lives in the first view.** Typing an id that does not match the
  DMJ-XX-YYYYMMDD-NN format used to reload the landing page with `?id=…` stuck
  in the URL and zero feedback (reported as "the system is not working"); the
  landing now echoes the typed value back (HTML-escaped; reflected-XSS test
  added) with an inline plain-language explanation of the format, and the input
  carries a native `pattern` hint. Browser-verified end-to-end: lowercase/padded
  valid ids normalise → 302 → `/c/:id` → live rite → verdict (preview and
  production); invalid ids now explain themselves. On upload (file-gate) pages
  the dropzone moves from below the fold INTO the hero — visitors were not
  discovering that they needed to upload the file — compact white-glass
  instrument under the verdict, in-view on desktop and 390px mobile, with the
  full ceremony verified by real file drops (byte-match → gold "Authentic.",
  altered bytes → red "This file does not match." with the attested document's
  identity correctly left intact). Skipped view-transitions no longer log
  console errors.

### Changed

- 2026-06-10: **"Daylight Examination": the verify portal moves to a light,
  research-grounded trust palette, the field becomes living binary, and the whole
  surface gains 3D morphic depth.** Credibility research (Stanford web-credibility,
  cross-cultural colour-trust studies) finds blue the most-trusted hue and clean
  light grounds the most credible surface, so the stage is now cool paper-white with
  deep navy ink, institutional blue for live examination, green strictly for
  confirmation, red strictly for alarm, and gold reserved for the earned seal (the
  only gold object on the page). The GPU field now renders a quantum byte-field:
  drifting "0"/"1" glyphs (a glyph atlas sampled by both WebGPU and WebGL2 backends,
  ink-on-paper compositing) moved by real force physics; during the live rite the
  document's bytes visibly spiral INTO the verdict to be read, then burst gold on a
  confirmed strike or fall as red embers on revoked/tampered. 3D morphic system
  everywhere: porcelain-glass slabs with specular rims, preserve-3d depth layers
  that parallax under pointer tilt and scroll-driven perspective reveals, extruded
  buttons with real press physics, 3D bead check-nodes, and a seal that floats in
  slow 3D precession. Scroll integrity fixed: the inverted view-timeline insets
  (94%+22% > 100% left an empty window that could strand bottom sections at
  opacity 0 on some engines, reading as "cannot scroll to the bottom") are replaced
  with valid animation-range entry bounds that always complete, reveals default to
  fully visible, a visible blue scrollbar replaces the near-invisible dark one, and
  pre-gesture haptics no longer error. Verified by real wheel + touch runs to
  gap-0 bottom on desktop and mobile across all states.

- 2026-06-10: **The verify portal is rebuilt as "The Examination Chamber," a fully
  cinematic, living verification theatre.** A midnight-navy + gold stage (the trust
  language of passports, banknotes and notarial seals) replaces the cream letterhead
  skin on the public verify surface only; the issuer admin keeps the shared design
  system. A new dependency-free client engine (`/assets/cinema-<hash>.js`, immutable,
  same-origin, ~10 KB gzip) renders a GPU particle field with a three-tier ladder:
  WebGPU compute (WGSL, ~7k particles) → WebGL2 point sprites → CSS aurora. The live
  re-verification plays as a ceremony: a cool steel-blue examination rite paced to the
  real `/api/verify/:id` fetch, check-constellation ignition, then the verdict strike
  (gold seal + particle convergence + shockwave on VALID; ember collapse on
  REVOKED/TAMPERED; cool fog on UNKNOWN). Scrutiny runs cool, warmth is earned:
  colour psychology is the interface. Below the fold the proof descends through the
  Three Worlds a verification crosses (the Signature lattice, the Ledger chain with
  the record's live anchor state, the Clock dial engraved with the verified RFC-3161
  genTime), each stating only what the server actually verified. Scroll-driven
  animations (`animation-timeline: view()/scroll()` with IntersectionObserver
  fallback), cross-document view transitions, a guilloche security-print rosette,
  pointer spotlight + magnetic buttons + 3D identity tilt, and a shader-level "text
  safe zone" that parts the particles behind type. Every trust invariant is preserved
  verbatim: SSR-correct verdicts with JS off, the earned-seal scarcity gate
  (`.verdict.valid.sealed`), the upload anti-spoof file gate, locked honesty wording
  (conditional anchor sentence, no "all N checks passed", never a licensed-CA claim),
  nonce-CSP with zero inline scripts and `img-src 'none'`, WCAG 2.2 AAA contrast on
  the dark stage, 44 px targets, and a fully still, final-state page under
  prefers-reduced-motion or Save-Data. Print gets a paper stylesheet. A seeded
  preview server (`pnpm --filter @dmjone/verify preview`) tours every state with
  zero infra.

### Added

- 2026-06-09: **Legal-grade forensic verification (Phase 1): RFC-3161 trusted
  timestamps + a court-ready evidence bundle.** Each issued credential is now
  best-effort timestamped by an independent RFC-3161 Time-Stamping Authority over
  its detached ML-DSA-87 signature (independent proof of *when* the signature
  existed; a TSA outage never blocks issuance), and the token is persisted. The
  verify service exposes `GET /api/credentials/:id/evidence` — a self-contained,
  fully offline-verifiable JSON bundle (canonical bytes, the ML-DSA-87 signature +
  public key, the transparency-log head + log key, the external anchor, the
  RFC-3161 token + its verified genTime/TSA subject, and step-by-step instructions
  an opposing expert can re-run with no access to dmj.one). A new token verifier
  (`verifyTimestampToken`) hand-walks the RFC-3161 ASN.1 with trial-verification
  signer-cert selection and digest-agility, proven against live DigiCert (RSA/
  SHA-256) and Sectigo (RSA/SHA-384) tokens. Honesty held throughout: every string
  is "independently-verifiable forensic evidence," never a licensed-CA Digital
  Signature Certificate or a statutory presumption (ML-DSA-87 is not CCA-recognized
  under Indian law). Requires `TSA_URL` on an RSA-SHA-2 TSA (DigiCert/Sectigo);
  FreeTSA (ECDSA) tokens store but verify invalid.

### Fixed

- 2026-06-08: **Letter/upload verify pages returned 500; their ML-DSA verdict read
  "unknown."** The Firestore read path (`rowToCredential`) dropped the `kind`
  discriminator, so every stored letter/upload read back as a certificate: the verify
  page rendered certificate fields the content doesn't have (`escapeHtml(undefined)` →
  500) and recomputed the canonical payload on the wrong branch (ML-DSA failed →
  "unknown"). `kind` is now restored on read; since it was already written to Firestore,
  existing letters/uploads heal with no re-issue. Added a serialization round-trip
  regression test — the in-memory test fakes store the record as-is and never exercised
  this seam.

### Changed

- 2026-06-10: **Verify surface raised to WCAG 2.2 AAA text standards.** The
  public pages (landing + credential) now read at 1.4.6 Contrast Enhanced:
  verify-scoped token overrides darken every small-text colour to >=7:1 on its
  actual ground (ink-soft 8.1:1, gold-deep 7.4:1, ok 7.7:1 on its soft chip,
  bad 8.0:1, warn 7.6:1 — computed, not eyeballed; the issuer admin keeps the
  shared AA palette; decorative gold stays non-text 3:1). Every small-print
  floor raised to legible sizes (hints/honesty/labels ~10.5-12.5px → 12.5-14.5px
  with 1.5 line-height; nothing user-facing below ~11.5px even on landscape
  compaction). The ID input now floors at 16px (kills iOS focus auto-zoom) and
  input/button/scroll-cue meet the 44px AAA target size. The placeholder is
  full-contrast italic serif instead of an opacity fade. On sub-380px-tall
  screens the decorative seal yields its space to the evidence lines. All
  states still fit one fold with the cue visible at every measured size.

- 2026-06-10: **Verify landing page: the cinematic front door.** The bare
  domain now speaks the credential pages' "Engraved Instrument" language: a
  one-fold hero that asks the visitor's literal question ("Is it genuine?",
  answered by the credential page's "Genuine."), with exactly one action, an
  engraved lookup plate (debossed entry groove, struck-gold Verify). No seal or
  "Verified" iconography appears before anything is verified (test-locked);
  the honesty line sits in the hero. Below the fold: the method in plain
  language (post-quantum signature, exact-bytes SHA-256, transparency log,
  live revocation), three ways to verify, and the locked technical paragraph
  verbatim. Typed IDs are now normalised (trim + uppercase) before validation,
  so a phone-typed lowercase ID redirects instead of silently bouncing back to
  the landing. Fits one fold with the scroll cue visible at every measured
  size (320px phones through 1920px desktops, landscape included), entrance
  fully present in under a second, reduced-motion safe, AA contrast.

- 2026-06-10: **Verify page: cinematic "Engraved Instrument" redesign + a
  brutal-critique hardening pass + WCAG 2.2 AA.** The public page is now a minimal
  ~100svh hero (verdict + gold seal) with the cryptographic proof progressively
  disclosed below the fold. A self-critique then closed the failure modes of a
  beautiful-but-misleading page: **bad-state gravity** — revoked/tampered now LEAD
  with the warning ("Revoked." / "Altered." with colour-independent ⊘/✕ glyphs, a
  struck-through + dimmed credential identity, no empty seal void), so a withdrawn
  or forged document can't be mis-read as genuine; a **certificate-comparison
  prompt** ("confirm the name, date and details match the document you're holding")
  since a copied QR can still display a true record; an **honesty line by the
  verdict** (independent initiative, not a government-licensed certifying
  authority); a **hero hard-fact line** so the first screen shows evidence, not
  just a seal; plainer jargon; and **WCAG-AA contrast** across the shared design
  system (small-text gold→gold-deep, `--warn` darkened to 4.85:1, form/dropzone
  borders to ≥3:1, focus rings). The hero is rem-sized + svh-compacted to fit one
  fold (no cut-off scroll cue) on phones, laptops, desktops and landscape; the
  title auto-fits any length with no vw feedback loop.

- 2026-06-09: **Verify page hardened against QR/ID spoofing, plus a dignified
  redesign.** For uploaded ("attested") documents, a scanned QR or typed document
  number no longer earns a green verdict on its own — a copied QR/number can sit on
  any file. The page leads with a cautious "Confirm your copy" file-gate whose
  decisive integrity check stays neutral until the holder provides the file, then
  re-runs the full cryptographic chain (hash + ML-DSA-87 signature + transparency
  log + revocation) and earns green only on a byte-for-byte match; a forged file is
  shown, honestly, as "does not match." Certificates and letters (which display
  authoritative content the verifier can compare) keep their id/QR verdict. The
  upload hero no longer force-uppercases the raw filename into an unreadable blob,
  and the on-screen fingerprint is masked.

- 2026-06-08: **High-quality transparent signature.** The handwritten-signature asset is
  now a clean transparent PNG — white background removed, JPEG speckle/ringing despeckled,
  ink recoloured to a uniform crisp blue, supersampled — replacing the opaque JPEG. The
  upload stamp no longer boxes a white rectangle over the document, and the
  certificate/letter signature blocks render cleanly. Regenerable via
  `packages/render/clean-signature.mjs`.

### Security

- 2026-06-08: **Handwritten signature moved to Secret Manager; removed from the repo.**
  The dmj.one signature is now provided at runtime via `SIGNATURE_PNG_BASE64` (mounted
  from the Secret Manager secret `signature-png` onto the issuer); the real signature
  image is no longer committed and is gitignored — a public GitHub mirror would otherwise
  let anyone scrape it. Local dev + tests use a bundled, non-personal "Specimen"
  placeholder (`packages/render/src/placeholder-signature.ts`). A pasted signature image
  cannot forge a *verifiable* dmj.one document (authenticity rests on the ML-DSA + PAdES
  signature, the transparency log, and the validation-ID QR), but the image is personal
  and shouldn't be scrapable. (It remained in git history from earlier commits — rotating
  to a fresh signature is recommended; see the deploy notes.)
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
