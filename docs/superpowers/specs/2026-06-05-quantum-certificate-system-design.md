# dmj.one Trust Services — Quantum-Verifiable Certificate System

**Status:** Approved (2026-06-05) · **Owner:** Divya Mohan · **Region:** `asia-east1` · **Cost target:** ₹0 / $0-idle

---

## 1. Summary

A certificate **issuing + verification** suite for dmj.one (an independent educational initiative, *not* a Pvt Ltd). The issuer (Divya, sole admin) creates a pixel-faithful signed PDF certificate. Anyone can independently verify a credential is authentic and untampered. Only the candidate, with **credential ID + a private password**, can download the actual digitally-signed PDF. The issuer's handwritten signature never appears on any public surface.

### Three honest reframes (idea → $0 reality)

| Idea's words | Delivered as |
|---|---|
| "quantum cryptography" | **Post-quantum** signatures: ML-DSA-65 (NIST FIPS 204) via `@noble/post-quantum`. Not QKD (needs quantum hardware). |
| "public decentralized ledger" | **Tamper-evident transparency log**: signed append-only hash-chain + free external anchor (public GitHub repo + OpenTimestamps→Bitcoin). Not a paid blockchain. |
| "legally valid, court-presentable" | **BSA 2023 §63 certificate of authenticity** + cryptographic tamper-evidence (both $0). The IT Act §85B *statutory presumption* needs a paid licensed-CA DSC — architecture supports slotting it in later. |

---

## 2. Locked decisions (from brainstorming Q&A)

1. **PDF signing = Hybrid.** Self-signed **PAdES** PKCS#7 (X.509 subject `CN=dmj.one Trust Services, OU=Document Signing, C=IN`) **+** detached **ML-DSA-65** signature. Acrobat shows a real signature object (marked "validity unknown" since self-signed); our web verifier is the authoritative trust anchor. A green Acrobat check needs paid Adobe AATL — out of scope.
2. **Admin auth = WebAuthn passkeys (multiple) + TOTP (Microsoft Authenticator) + one-time recovery codes.** Lockout-proof and $0. **SMS dropped** (costs money, SIM-swap risk, no lockout benefit over recovery codes). Optional $0 "code to phone" channel: Telegram bot or email OTP.
3. **Public ledger = tamper-evident signed hash-chain + free external anchor** (GitHub + OpenTimestamps).
4. **Public verify exposure = full HR/legal fields** (recipient name, credential type, issue date, status, issuer identity, live quantum-verification result) — everything an HR/court needs to validate, stated honestly. Handwritten-signature image and PDF download stay password-gated.

---

## 3. The two distinct artifacts

### A. The signed PDF (formal document, password-gated)
- Pixel-faithful to `assets/dmj_one_letterhead_TEMPLATE.html`: A4, gold double-frame + diamond corners, watercolor logo, faint watermark, EB Garamond / Playfair Display / Marcellus / Great Vibes typography, **visible handwritten signature**, QR → public credential page.
- Hybrid-signed (PAdES + ML-DSA). Rendered deterministically (fonts + images bundled in the container; never network-fetched).
- Downloadable **only** via credential ID + password.

### B. The online credential (public verification experience, deliberately distinct)
- Web-native page at `verify.dmj.one/c/<credentialId>` (the QR target). Distinct visual language from the PDF: live "quantum-verifying…" sequence, VALID badge, all HR/legal fields, issuer trust statement, downloadable §63 certificate.
- **No handwritten-signature image. No PDF download.** The signature lives only inside the gated PDF.

---

## 4. The three flows

```
ISSUE (admin, private)            VERIFY (public, keyless)          DOWNLOAD (candidate, gated)
──────────────────────            ────────────────────────          ───────────────────────────
WebAuthn + TOTP login         →   By ID / QR → status + fields  →   credential ID + password
Fill credential fields            OR upload PDF/file → tamper        → Argon2id verify
Render HTML → PDF (Chromium)       check (no password needed)         → stream stored signed PDF
Hybrid-sign (PAdES + ML-DSA)      → VALID / TAMPERED / UNKNOWN        → + §63 certificate
Append leaf to hash-chain log     → download §63 legal certificate
Store (Firestore, chunked)
Set candidate password (Argon2id)
```

**Invariant:** verifying an already-shared PDF requires **no** password (the employer holds the file). The password gates *obtaining* the PDF, not *checking* one.

---

## 5. Cryptography & tamper-evidence

**The signing pipeline is locked in this exact order** (`computeCanonicalPayload` lives in `@dmjone/shared`, used by both sign and verify so the bytes are byte-identical):

1. `render(content)` → **unsignedPdf**
2. embed **PAdES** PKCS#7 placeholder + sign → **signedPdf** (`@signpdf/signpdf` + custom Signer over our X.509 key via `node-forge`). **This is final — never mutated after.**
3. `pdfSha256 = SHA-256(signedPdf)`
4. `canonical = computeCanonicalPayload(content, pdfSha256)` (shared, sorted-key JSON, UTF-8)
5. `mldsaSignature = ML-DSA-65.sign(UTF8(canonical))` (`@noble/post-quantum`) — **DETACHED**: stored in Firestore + the log, **never written into the PDF** (so `pdfSha256` stays stable and upload-verify works)
6. `canonicalSha256 = SHA-256(UTF8(canonical))`; `leaf = SHA-256(canonicalSha256)` → append to chain

Because ML-DSA covers `pdfSha256`, and `pdfSha256` is the hash of the already-PAdES-signed bytes, the quantum signature transitively covers the PAdES signature too.

- **1-bit tamper detection.** Any change to the distributed PDF bytes → `hash(uploaded) ≠ pdfSha256` → `TAMPERED`. Any change to a field → ML-DSA verify fails. Demonstrated live on the verify page (flip-a-bit demo).
- **Rendering is NOT required to be byte-reproducible.** No verify path re-renders; the system hashes and serves the exact persisted signed bytes. Fonts/images are bundled only for correct appearance + offline rendering. (Chasing deterministic Chromium output — `/CreationDate`, `/ID`, font subsetting — is explicitly out of scope.)
- **Transparency log.** Append-only hash-chain: `head_n = SHA-256(leaf_n ‖ head_{n-1})`, `leaf_n = SHA-256(canonicalPayload_n)`. Each new head is ML-DSA-signed (Signed Tree Head). 
- **External anchor (free).** The latest signed head is published (best-effort, per-issue in v1) to (a) a public GitHub repo (commit = immutable public timestamp) and (b) OpenTimestamps (Bitcoin anchor). Anyone can prove the set wasn't altered or back-dated.
- **Per-cert validity vs. anchor (informational).** A credential's `valid` outcome = ML-DSA signature ✓ ∧ log inclusion ✓ ∧ not revoked. The external anchor is an *additional* tamper-evidence layer (proving the log itself wasn't rewritten/back-dated) and does **not** gate `valid` — anchoring is periodic/best-effort, so a just-issued cert is genuinely valid before its anchor lands. Anchor coverage for a cert = latest published anchor `headSeq ≥ cert.logSeq` (anchoring head N proves every leaf ≤ N via the chain). Surfaced as "anchored" vs "anchor pending".
- **Key custody.** Signing keys (PAdES X.509 private key + ML-DSA secret key) generated once, **encrypted at rest** (AES-256-GCM, master key from Secret Manager), stored in Secret Manager. Loaded into memory **only in the issuer service**, used **only at issue-time**. The public `verify` service holds **no** private key — only public keys.

---

## 6. Admin authentication & recovery (lockout-proof, $0)

1. **Primary:** WebAuthn passkeys, **register several** (Windows Hello/TPM platform authenticator, phone passkey, optional roaming key). Losing one never locks you out.
2. **Step-up factor:** TOTP (RFC 6238) enrolled in Microsoft Authenticator (standard TOTP, offline, $0).
3. **Last-resort recovery:** N one-time recovery codes (Argon2id-hashed at rest, shown once at setup). Recovery code + TOTP → register a fresh passkey.
4. *(Optional)* $0 OTP channel via Telegram bot / email — never SMS.

Per super-admin standard: secrets encrypted at rest, exponential backoff (1s→…→1h cap), permanent lockout after 10 fails (unlock = reinstall), tamper-evident audit trail, DDoS early-reject (static 429 before processing).

---

## 7. Legal posture (honest)

Delivered at $0:
- **BSA 2023 §63 certificate of authenticity** auto-generated per credential: hash value, system/device particulars, production method, Part-A operator statement pre-filled (Part-B expert signature added by whoever presents it in court). This is the live mechanism for admissibility of electronic records in Indian courts.
- **Independent cryptographic verification** + **public transparency log** = strong, court-presentable evidence of authenticity + integrity.
- **Bounded, truthful claim** on every surface: "dmj.one, an independent educational initiative, attests to this credential; the cryptographic signature proves the attestation is authentic and unaltered." No false claim of government accreditation or licensed DSC.

Upgrade path (paid, optional, no re-architecture): replace the self-signed PAdES signer with a **licensed-CA DSC** → gain the IT Act §85B statutory presumption. The Signer interface is pluggable for exactly this.

---

## 8. Architecture & infrastructure

### Services (Cloud Run, `asia-east1`, scale-to-zero)

| Service | Domain → `ghs.googlehosted.com` | Private key? | Responsibilities |
|---|---|---|---|
| **issuer** | `issue.dmj.one` | **Yes** | WebAuthn/TOTP/recovery, Chromium render, hybrid signing, §63 generation, log append + anchor, super-admin panel |
| **verify** | `verify.dmj.one` | **No** | Public credential page, ID lookup, file-upload tamper check, password-gated download, §63 serving |

### Data (Firestore Native, free tier, $0-idle)
- `credentials/{id}` — canonical fields, status, hashes, public-key refs, ML-DSA signature, Argon2id password hash, §63 metadata.
- `credentials/{id}/pdf_chunks/{n}` — signed PDF bytes chunked (~256 KB/doc) to stay under the 1 MB doc limit + free tier.
- `log/{seq}` — hash-chain leaves + signed heads.
- `anchors/{id}` — external anchor proofs (GitHub commit SHA, OTS receipt).
- `admin/*`, `audit/*` — admin credentials (encrypted), audit trail.

### Secrets (Secret Manager free tier)
- Master encryption key, signing keys (encrypted), anchor GitHub token, optional Telegram token. App auto-encrypts plaintext on first run.

### Repo layout (pnpm monorepo)
```
packages/
  shared/   contracts: types, zod schemas, API shapes, errors, constants   [OWNER: orchestrator]
  crypto/   keys, hybrid sign, ML-DSA, verify, hash-chain, anchor           [Stream A]
  data/     Firestore repositories, chunked blob store, Secret Manager      [Stream D]
  render/   HTML→PDF (Chromium), bundled fonts/images, cert template        [Stream E]
  brand/    shared design tokens + components (consumed by issuer/verify)   [Stream E]
services/
  issuer/   admin auth, issuance, super-admin, §63 gen (+ admin UI)         [Stream B]
  verify/   public credential page, lookup, tamper check, download (+ UI)   [Stream C]
infra/      Dockerfiles, Cloud Run config, autoconfig.sh, deploy/, CI/CD    [Stream D]
```

All streams code against **locked interfaces** in `packages/shared`, so they build in parallel.

### Standards (per global config)
TypeScript strict · zod env validation (crash on misconfig) · pino structured logs + correlation IDs · parameterized/typed data access · TLS 1.3 + security headers + nonce CSP · WCAG 2.2 AA · health checks (`/health`, `/health/ready`) · multi-stage distroless Dockerfiles (non-root, read-only fs) · `autoconfig.sh` idempotent deploy · CHANGELOG before every commit.

---

## 9. Parallel build plan (agent teams)

Opus agent team (max thinking), one teammate per stream, coordinating via SendMessage with midcourse updates. Contracts locked first.

- **A — crypto** (`packages/crypto`): cryptography core.
- **B — issuer** (`services/issuer`): admin auth + issuance + super-admin + admin UI.
- **C — verify** (`services/verify`): public credential UX + lookup + tamper check + download.
- **D — data/infra** (`packages/data`, `infra/`): persistence + deploy + CI/CD.
- **E — render/brand** (`packages/render`, `packages/brand`): pixel-faithful PDF + shared brand.

Dependency note: A, D, E depend only on `shared`; B, C depend on A, D, E via interfaces. Locking interfaces up front lets all five proceed concurrently.

### Orchestration rules (locked — prevents build-graph races)

1. **The orchestrator owns every `package.json` dependency set and runs the single `pnpm install`.** Agents write **source only**. New dependency needed → request via SendMessage; the orchestrator batches and installs. No agent runs `pnpm add`/`pnpm install` (concurrent installs corrupt the shared lockfile + store).
2. **Every stream typechecks against `@dmjone/shared` interfaces only — never against a sibling implementation package.** Services export **factory functions** that accept their dependencies typed as shared interfaces (dependency injection). Each stream ships in-memory/mock implementations of the interfaces it consumes, for its own tests.
3. **The orchestrator writes the composition roots** (the entrypoints that wire concrete crypto/data/render implementations into issuer/verify) at integration time, after the implementation packages build. This is also why no TS project references are needed between impl packages.

---

## 10. Out of scope for v1

### Phase 2 — add once v1 is complete & verified (per user, 2026-06-05)
- **PAdES-LTV / RFC-3161 timestamps** — extend the (pluggable) HybridSigner with a TSA timestamp + DSS/LTV.
- **Multi-tenant / multi-issuer** — add a tenant dimension to the data model + auth.
- **SMS OTP** — add SMS as an additional admin-recovery channel via the OTP-channel abstraction (accepts the per-message cost at that point).

### Deferred indefinitely (cost / not needed)
- **HTTPS Load Balancer / mTLS** — standing metered cost; WebAuthn already delivers the hardware-key guarantee. (User: "it will just use more money. defer it.")
- **Real blockchain** — gas/hosting cost; the signed hash-chain + free external anchor covers tamper-evidence.
- **Licensed-CA DSC** — paid; slots into the pluggable signer when the IT Act §85B presumption is wanted.
- **Revocation CRL/OCSP** — a status flag covers revocation in v1.

The v1 architecture is built so every Phase-2 item slots in without re-architecture (pluggable signer, OTP-channel abstraction, evolvable data model).

---

## 11. Risks & worst-case mitigations

| Risk | Worst case | Mitigation |
|---|---|---|
| Signing-key theft | Forged certs | Key only in issuer, encrypted at rest, used only at issue-time; public service keyless |
| Cold start (Chromium) | Slow first issue | Heavy Chromium only in issuer; verify is lean; only admin feels it |
| Mutating the PDF after signing | Upload-verify fails | `signedPdf` is immutable; hash + persist the exact bytes; ML-DSA is detached, never embedded |
| Firestore 1 MB doc limit | Can't store PDF | Chunk PDF across subcollection |
| Legal overclaim | Misled HR/court | Honest §63 + bounded attestation wording on every surface |
| Account lockout | Can't issue | Multiple passkeys + TOTP + recovery codes |
