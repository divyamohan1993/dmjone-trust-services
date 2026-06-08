# FROZEN CONTRACT — dmj.one Trusted Documents · PHASE 1: Foundation

Status: **FROZEN** (2026-06-08). This is Phase 1 of a 3-mode system (certificate-any-type, letterhead letter, upload-&-attest). Phase 1 builds the shared trust backbone all three modes ride; the per-mode UI/templates/routes are Phase 2 and are out of scope here. Build EXACTLY to this. Values given (JSON shapes, signatures, regexes, ID formats) are normative and exact.

## 0. Goal + non-negotiable invariants

Generalize the issuer from "certificates" to **trusted documents** with a `kind` discriminator, so the existing pipeline — PAdES embed → pdfSha256 → canonical payload → detached ML-DSA-87 → transparency log → record + blob → verify-by-QR — serves all three kinds unchanged.

1. **FROZEN certificate payload (the prime directive).** The bytes ML-DSA signs for a `kind:'certificate'` document MUST be byte-for-byte identical to today's `computeCanonicalPayload(content, pdfSha256)` (`packages/shared/src/canonical.ts`). Any divergence breaks every already-issued certificate. This is guarded by a **golden test** (§5) that MUST pass.
2. **Backward-compatible records.** A stored record with no `kind` field reads as `kind:'certificate'`. Existing `CredentialRecord` data is valid unchanged.
3. **No behavior change to certificate issuance/verification** beyond the mechanical signer-API and recompute-by-kind refactor. The existing issuer + verify + e2e test suites stay green.
4. **Determinism / security unchanged.** Canonical JSON stays sorted-keys, no-whitespace, UTF-8 (`canonicalJson`). All input still validated server-side by zod. Quantum-safe ML-DSA-87 + PAdES untouched.

## 1. Data model (`packages/shared/src/types.ts`)

```ts
export type DocumentKind = 'certificate' | 'letter' | 'upload';

// CredentialContent — UNCHANGED (the certificate content).

/** Letterhead letter content (rich body reuses the cert body markup grammar:
 *  the `[[align:…]]` directive + **/*/__ inline marks, compiled by compileParagraph). */
export interface LetterContent {
  documentId: string;        // DMJ-LTR-YYYYMMDD-NN
  issueDate: string;         // YYYY-MM-DD
  reference?: string;        // optional "Ref:" line
  recipientLines: string[];  // the "To" address block, 0..8 lines (each <=120 chars)
  subject?: string;          // optional "Subject:" line
  salutation?: string;       // "Dear Sir/Madam,"
  bodyParagraphs: string[];  // rich, 1..40 paragraphs (long letter; same markup as cert body)
  valediction?: string;      // "Sincerely,"
  signatory: Signatory;      // reuse DEFAULT_SIGNATORY
}

/** Where on the uploaded PDF the handwritten signature image was stamped.
 *  All coordinates are FRACTIONS of the page box (origin = top-left), so they are
 *  resolution-independent; height is derived from the image aspect ratio. */
export interface SignaturePlacement {
  page: number;   // 1-based page index
  xPct: number;   // 0..1 left edge / page width
  yPct: number;   // 0..1 top edge / page height
  wPct: number;   // 0..1 signature width / page width
}

/** Attestation metadata for an uploaded-&-signed PDF (no rendered content). */
export interface UploadAttestation {
  documentId: string;        // DMJ-DOC-YYYYMMDD-NN  (the visible "document number")
  issueDate: string;         // YYYY-MM-DD
  originalFilename: string;  // sanitized basename, <=200 chars
  originalSha256: string;    // hex SHA-256 of the uploaded bytes BEFORE any stamping
  pageCount: number;         // pages in the uploaded PDF
  signaturePlacement?: SignaturePlacement; // present iff the handwritten signature was stamped
  signatory: Signatory;
}
```

Generalized record: add `kind` + widen content via a discriminated union. Keep the name `CredentialRecord` (minimize churn); add `kind?: DocumentKind` (absent ⇒ certificate) and type `content` as `CredentialContent | LetterContent | UploadAttestation`. The crypto block (`pdfSha256`, `canonicalPayload`, `canonicalSha256`, `mldsaSignature`, `mldsaPublicKeyId`, `padesCertFingerprint`), `status`, `logSeq`, `logLeafHash`, `passwordHash`, `section63`, timestamps are **unchanged and shared** across kinds. (Letters + uploads also get a `passwordHash` for the gated download and a `section63` block — the §63 certificate-of-authenticity applies to any electronic record.) Provide a helper `documentKind(record): DocumentKind` returning `record.kind ?? 'certificate'`.

## 2. Canonical payloads (`packages/shared/src/canonical.ts`)

- **`computeCanonicalPayload(content: CredentialContent, pdfSha256): string` — UNCHANGED. Do not touch its body.** (Certificate branch; frozen.)
- Add, using the SAME `canonicalJson` (sorted keys, no whitespace) and the `?? ''` / `?? []` normalization style:

```ts
export const LETTER_PAYLOAD_VERSION = 1;
export function computeLetterCanonicalPayload(c: LetterContent, pdfSha256: string): string {
  return canonicalJson({
    v: LETTER_PAYLOAD_VERSION, kind: 'letter',
    documentId: c.documentId, issueDate: c.issueDate,
    reference: c.reference ?? '', recipientLines: c.recipientLines,
    subject: c.subject ?? '', salutation: c.salutation ?? '',
    bodyParagraphs: c.bodyParagraphs, valediction: c.valediction ?? '',
    signatory: c.signatory, pdfSha256,
  });
}

export const UPLOAD_PAYLOAD_VERSION = 1;
export function computeUploadCanonicalPayload(a: UploadAttestation, pdfSha256: string): string {
  return canonicalJson({
    v: UPLOAD_PAYLOAD_VERSION, kind: 'upload',
    documentId: a.documentId, issueDate: a.issueDate,
    originalFilename: a.originalFilename, originalSha256: a.originalSha256,
    pageCount: a.pageCount,
    signaturePlacement: a.signaturePlacement ?? null,
    signatory: a.signatory, pdfSha256,
  });
}
```

Add a dispatcher used by BOTH issuer and verify so the bytes are identical on both sides:
```ts
export function computeCanonicalPayloadForRecord(record: CredentialRecord): string {
  switch (record.kind ?? 'certificate') {
    case 'certificate': return computeCanonicalPayload(record.content as CredentialContent, record.pdfSha256);
    case 'letter':      return computeLetterCanonicalPayload(record.content as LetterContent, record.pdfSha256);
    case 'upload':      return computeUploadCanonicalPayload(record.content as UploadAttestation, record.pdfSha256);
  }
}
```

## 3. Signer decoupling (`packages/crypto/src/hybrid-signer.ts` + `packages/shared` HybridSigner interface)

The canonical payload includes `pdfSha256`, which only exists AFTER PAdES signing — so the signer cannot receive a precomputed string. Decouple via a **payload builder callback**:

```ts
// packages/shared (HybridSigner interface):
sign(
  unsignedPdf: Uint8Array,
  buildCanonicalPayload: (pdfSha256: string) => string,
): Promise<HybridSignatureResult>;
```

Inside `createHybridSigner().sign`: PAdES → `pdfSha256 = sha256Hex(signedPdf)` → `canonicalPayload = buildCanonicalPayload(pdfSha256)` → ML-DSA over `toUtf8Bytes(canonicalPayload)` → return the existing `HybridSignatureResult` (now `canonicalPayload` is whatever the builder returned). `HybridSignatureResult` shape is otherwise **unchanged**.

**Certificate call site** (`services/issuer/src/issuance/issue.ts`): change `deps.signer.sign(unsignedPdf, content)` → `deps.signer.sign(unsignedPdf, (h) => computeCanonicalPayload(content, h))`. **Byte-identical** result — this is the golden-test gate.

**Verify side** (`services/verify/src/verification.ts`): wherever it recomputes canonical from the stored record via `computeCanonicalPayload(record.content, record.pdfSha256)`, replace with `computeCanonicalPayloadForRecord(record)`. For existing cert records (no `kind`) this is byte-identical → existing certs verify.

## 4. Schemas + IDs (`packages/shared/src/schemas.ts`, `constants.ts`, issuer allocator)

- `issueCredentialSchema` — UNCHANGED.
- Add `issueLetterSchema` (zod): `{ issueDate: YYYY-MM-DD, reference?: str<=120, recipientLines: array(str.trim().max(120)).max(8) default [], subject?: str<=160, salutation?: str<=120, bodyParagraphs: array(str.trim().min(1).max(1200)).min(1).max(40), valediction?: str<=80, password: str.min(8).max(128) }`.
- Add `signUploadSchema` (zod, the metadata that accompanies the uploaded file in a multipart or JSON+base64 request — Phase 2 wires transport): `{ originalFilename: str.min(1).max(200), placeHandwrittenSignature: boolean default false, signaturePlacement?: { page: int>=1, xPct: 0..1, yPct: 0..1, wPct: 0.02..1 }, password: str.min(8).max(128) }`. (The PDF bytes themselves are validated in Phase 2's route, not here.)
- ID scheme: today certs use a per-type code in `DMJ-<CODE>-YYYYMMDD-NN` (regex `CREDENTIAL_ID_REGEX = /^DMJ-[A-Z]{2,4}-\d{8}-\d{2}$/`). Reserve **`LTR`** for letters and **`DOC`** for uploads. Generalize the issuer's `allocateCredentialId` (`services/issuer/src/issuance/credential-id.ts`) to take an explicit 2–4 letter prefix (keep the existing per-cert-type mapping for certificates) so letters/uploads allocate `DMJ-LTR-…`/`DMJ-DOC-…` against the same per-day sequence counter. `CREDENTIAL_ID_REGEX` already matches `LTR`/`DOC` (3 letters) — unchanged.

## 5. Golden backward-compatibility tests (THE GATE — required, must pass)

Add tests proving certificates are untouched:
1. **Frozen-cert-payload golden vector** (`packages/shared` or `packages/crypto`): a fixed `CredentialContent` + fixed `pdfSha256` ⇒ assert `computeCanonicalPayload(...)` equals a hard-coded expected canonical JSON string (capture the CURRENT output first, paste it as the literal expectation). This freezes the bytes against any accidental edit.
2. **Sign-parity**: `createHybridSigner` over a fixed unsigned PDF with `(h)=>computeCanonicalPayload(content,h)` yields a `canonicalPayload`/`canonicalSha256` equal to the pre-refactor path for the same inputs (the existing crypto tests already cover signing; extend/keep them green).
3. **Verify-parity**: `computeCanonicalPayloadForRecord(certRecord)` === `computeCanonicalPayload(certRecord.content, certRecord.pdfSha256)` for a record with NO `kind` and one with `kind:'certificate'`.
4. The existing `services/issuer`, `services/verify`, `packages/crypto`, and `tests/e2e` suites all stay green (the e2e issue→verify→download→tamper pipeline is the end-to-end proof).

## 6. Ownership + checks (Phase 1)

This is a coordinated cross-package refactor; keep it coherent. A single build agent owns ALL of:
`packages/shared/src/{types.ts,canonical.ts,schemas.ts,constants.ts,contracts.ts}`, `packages/crypto/src/hybrid-signer.ts`, the cert call-site edits in `services/issuer/src/issuance/{issue.ts,credential-id.ts}`, the verify recompute edit in `services/verify/src/verification.ts`, and the new/updated tests across those packages. Do NOT add Phase-2 routes, templates, or UI. Do NOT change `HybridSignatureResult`'s shape or any crypto algorithm.

Run and report: `pnpm -s typecheck` (whole workspace — the signer interface change ripples, so a workspace typecheck is required) and `pnpm -r test` (whole workspace). Everything green, golden tests included.
