<div align="center">

# dmj.one Trust Services

### A certificate you can't fake. Verifiable by anyone. Quantum-safe. Free to run.

</div>

---

Issue a credential once. From that moment, anyone in the world can confirm it is
unaltered — down to a single flipped bit — by re-running the math themselves,
without trusting our servers to stay online, and without ever seeing the issuer's
signature. (Issuer *identity* rests on our published key; integrity does not.) The
holder, and only the holder, can download the formal signed PDF with a private
password.

No blockchain fees. No always-on servers. **₹0 when idle.**

## Why it's different

- **Post-quantum signatures.** Every credential is signed with ML-DSA-87 (NIST
  FIPS 204). A future quantum computer still can't forge it.
- **Tamper-evident, publicly auditable.** Each credential is chained into a
  signed append-only log whose head is published to a public GitHub repository —
  an externally-hosted, timestamped commit record. Back-dating or silent edits
  are caught by anyone who has recorded an earlier head. (Direct Bitcoin
  anchoring via OpenTimestamps is planned, not yet live.)
- **Provable revocation.** Revoking a credential mints a dated, ML-DSA-signed
  status assertion, so "revoked on date X" is something a relying party can
  prove — not just a flag on our server.
- **The signature stays private.** The handwritten signature lives only inside
  the password-gated PDF — never on a public page.
- **Court-ready, honestly.** Each credential ships a Bharatiya Sakshya Adhiniyam
  2023 §63 certificate of authenticity. We claim exactly what we can prove.

## Two faces of one credential

| The signed PDF | The online credential |
|---|---|
| Pixel-faithful formal document, handwritten signature, hybrid-signed | Distinct web experience, live quantum verification, no signature shown |
| Download needs **credential ID + password** | Public — anyone can verify by ID, QR, or by uploading the file |

## Architecture

Two Cloud Run services in `asia-east1`, both scale-to-zero:

- **issuer** (`issue.dmj.one`) — holds the signing key, renders + signs, admin-only.
- **verify** (`verify.dmj.one`) — public, keyless, verification + gated download.

See [`docs/superpowers/specs/2026-06-05-quantum-certificate-system-design.md`](docs/superpowers/specs/2026-06-05-quantum-certificate-system-design.md)
for the full design.

## Run it

```bash
pnpm install
pnpm -r build
pnpm -r --workspace-concurrency=1 test     # the full suite, all packages
pnpm --filter @dmjone/e2e test              # the full pipeline, end to end
```

The e2e renders a real certificate with headless Chromium, hybrid-signs it,
verifies it, downloads it byte-for-byte behind a password, and proves a single
flipped bit is detected as tampering.

## Deploy

Two Cloud Run services in `asia-east1`, scale-to-zero. See
[`infra/DEPLOY.md`](infra/DEPLOY.md) for the runbook and the `ghs.googlehosted.com`
CNAMEs, or run [`infra/autoconfig.sh`](infra/autoconfig.sh) for a one-command deploy.

## Status

v1 complete — all packages green, full workspace builds clean, the end-to-end
pipeline is proven. Provable, signed revocation + honest §63 (§86/§87) shipped;
see [the court-readiness assessment](docs/court-readiness-assessment.md) for where
this stands on cryptographic integrity vs. Indian statutory recognition, and
[CHANGELOG.md](CHANGELOG.md) for the log. Real Bitcoin/OpenTimestamps anchoring
and a CCA-licensed signing path remain scoped, not yet shipped.
