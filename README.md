<div align="center">

# dmj.one Trust Services

### A certificate you can't fake. Verifiable by anyone. Quantum-safe. Free to run.

</div>

---

Issue a credential once. From that moment, anyone in the world can confirm it is
authentic and unaltered — down to a single flipped bit — without trusting us, and
without ever seeing the issuer's signature. The holder, and only the holder, can
download the formal signed PDF with a private password.

No blockchain fees. No always-on servers. **₹0 when idle.**

## Why it's different

- **Post-quantum signatures.** Every credential is signed with ML-DSA-65 (NIST
  FIPS 204). A future quantum computer still can't forge it.
- **Tamper-evident, publicly auditable.** Each credential is chained into a
  signed append-only log whose head is anchored to a public, immutable place
  (GitHub + Bitcoin via OpenTimestamps). Back-dating or silent edits are caught.
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

## Status

🚧 Under construction. See [CHANGELOG.md](CHANGELOG.md).
