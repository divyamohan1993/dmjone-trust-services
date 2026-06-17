# Design v3 — Document template library + privacy hardening (single-issuer)

- **Date:** 2026-06-17 · **Tier:** Heavy (public legal documents, anti-forgery, BGV/police use, PII, touches the live verify/crypto core)
- **Status:** DRAFT v3.1 — WS1 + WS2 fully designed; WS2 security re-review returned **GO** after folding 4 follow-up gaps (A legacy/uniform collision, B `/api/download` erase, C `/status` oracle, D route disambiguation). Awaiting **user approval**. User chose **bundle**: design both completely, ship together. **NO implementation code until approved.**
- **Owner:** Divya Mohan (`dmj.one`, single issuer). **Jurisdiction:** India.
- **Changelog v2→v3:** WS2 redesigned against the code-grounded security review — explicit `erased` record state short-circuiting BEFORE verification on every read path; repo `erase` method + exact purge/retain field set (incl. `canonicalPayload` plaintext + `section63` blob); EVERY PII read route token-gated (`/c`, `/api/verify/:id`, `/api/verify/file`, `/evidence`, `/section63`); sequential id made a non-existence-oracle (uniform response); constant-time token compare; `verifyToken` excluded from canonical payload AND evidence; legacy id-lookup kept behind the rate-limiter for already-issued immutable PDFs; id/token input kept on download + file-verify forms. (v1→v2 folded the 4-lens review: dropped editable footer, expanded denylist, issue-time employment block, pinned grammar/`[auto]`/attestation, cut runtime cruft, renamed Bonafide.)

## Gate 0 — who / when / why
- **Who:** Divya Mohan issuing for `dmj.one` (independent educational initiative; one fixed signatory).
- **When:** issuing to someone who **genuinely** interned / contributed / studied with dmj.one and needs a verifiable document for a job / application / background check.
- **Why easier:** removes the burden of hand-authoring credible Indian document wording every time; makes the result more credible (correct fields, foregrounded verification) and safer (guardrails block the misattribution that turns a document into forgery); and brings the hosted PII in line with DPDP (erasure + non-enumerable retrieval).
- **Hard non-goal:** producing official-looking documents for work that did not happen. That is forgery; the feature is engineered to make it harder, not easier.

## Scope
**In — 9 document types (single-issuer):**
| # | Document | Kind | Group | Sourcing |
|---|---|---|---|---|
| 1 | Internship offer letter | letter | internship | convention (forward-looking — see note) |
| 2 | Internship completion / experience certificate | certificate | internship | **directly sourced** |
| 3 | Internship letter of recommendation | letter | internship | convention-extended `[lawyer-review]` |
| 4 | Project / OSS contributor experience certificate | certificate | contributor | convention-extended `[lawyer-review]` |
| 5 | Contributor letter of recommendation | letter | contributor | convention-extended `[lawyer-review]` |
| 6 | Course / training completion certificate | certificate | training | convention-extended `[lawyer-review]` |
| 7 | Participation certificate | certificate | training | convention-extended `[lawyer-review]` |
| 8 | Appreciation certificate | certificate | training | convention-extended `[lawyer-review]` |
| 9 | Association-verification letter | letter | verification | **directly sourced** |

- Offer-letter (forward-looking): kept; its attestation asserts "this offer is genuinely being made". Flagged so the issuer treats it as a real commitment.
- The 7 convention-extended types show a `[lawyer-review pending]` marker in the picker until wording is reviewed; not a hard issuance block (sole owner attests), but honestly surfaced.

**Out (on record):** salary/CTC certificates; salaried appointment/relieving letters; degree/diploma; multi-tenant issuance.

## Research-grounded constraints (sourced; confidence + cites in ledger)
1. **No statutory format** (HIGH) → short, factual; validity = true facts + reachable issuer + verifiability.
2. **Forgery = false authorship (BNS §335) + fraudulent intent (§336)** (HIGH, SC *Sheila Sebastian*) → risk is misattribution/false status, not body prose → **word-denylist**.
3. **Internship ≠ employment** (HIGH) → no `employee/employment/salary/wages/stipend-as-pay/PF/ESI` language.
4. **DPDP 2023**: issuer is a **Data Fiduciary**; §8(5) security, §8(7) erasure; §7(a) supports issuing but NOT settled for public hosting (FRAGILE 2-1) → issuer-attested consent + true erasure + non-enumerable retrieval (WS2).
5. **BGV contacts the issuer**; fails on unreachable/overstated (MEDIUM) → keep the existing face verification footer + reachable contact prominent.
6. **Self-issued ML-DSA ≠ IT-Act digital signature** (HIGH) → never claim "digital signature/CA/government-recognized"; denylist enforces; verify page already honest.
7. **Refuted:** letterhead+seal as a hard rule; clean EPF intern exemptions.

---

# WS1 — Templates + content guardrails (additive; no crypto-core change)

### Catalog — `packages/shared/src/doc-templates.ts`
```ts
export interface DocTemplate {
  id: string;            // 'internship-completion-cert'
  label: string;         // picker label; '⚠ lawyer-review' suffix for convention-extended
  kind: DocumentKind;    // 'certificate' | 'letter'
  cert?: { type: CredentialType; kicker: string; title: string; intro: string; bodyParagraphs: string[]; closingLine?: string };
  letter?: { reference?: string; recipientLines: string[]; subject?: string; salutation?: string; bodyParagraphs: string[]; valediction?: string };
}
export const DOC_TEMPLATES: readonly DocTemplate[] = [ /* all 9 */ ];
```
Data only — populates EXISTING `CredentialContent`/`LetterContent` fields; renderer/signer/verify content path unchanged. Provenance/lawyer-review lives in this ledger + the label suffix, not runtime data.

### Picker (admin console)
`<select>` per mode (cert / letter), options = catalog filtered by `kind`, optional `<optgroup>` from a label prefix. Catalog injected as JSON in the existing nonce'd inline admin script (no new fetch). On select: confirm-if-nonempty, then populate `type/kicker/title/intro` inputs and rebuild the contenteditable composer blocks from `bodyParagraphs` (one block/paragraph; leading `[[align:…]]` sets the block `pa-*` class else justify), via the existing trust-boundary serializer. `[slots]` are plain editable text.

### Content guardrails (issue-time boundary = `packages/shared/src/schemas.ts`)
1. **Unfilled-slot check.** Per text field: strip a single leading anchored `^[[align:(left|center|right|justify)]]` (parity with `render/src/html.ts ALIGN_DIRECTIVE`) + the reserved `[auto]` token; then reject if any `[` remains (400, field + leftover). Fields: cert = `kicker,title,intro,bodyParagraphs[],closingLine,recipientName`; letter = `recipientLines[],subject,salutation,bodyParagraphs[],valediction`. `recipientName` exempt from `[auto]`.
2. **Word-denylist** (regex, case-insensitive, `\b`-bounded; phrases match across single spaces; same fields at issue-time + build-time catalog lint):
   - Status/registration: `company, pvt, private limited, ltd, llp, corporation, incorporated, registered, registered under, recognized, recognised, recognized by, accredited, affiliated, institution, institute, foundation, society, trust, ngo, section 8, government[- ](approved|recognized|recognised|registered|backed|certified), iso[- ]?certified, cin, gstin`.
   - Signature/authority (backs #6): `certifying authority, digital signature, dsc, secure electronic signature, e[- ]?sign, esign, government certified`.
   - Internship-scoped (only internship-group issuance): `employee, employment, salary, wages, payroll, stipend, pf, epf, esi`.
   - Exact list `[lawyer-review]`; over-blocking acceptable (issuer rephrases).
3. **Issuer attestation** — ONE required checkbox: *"The facts are true and dmj.one had this association; I am authorised to issue this; and the recipient consents to dmj.one issuing and hosting an independently-verifiable copy."* Stored top-level as `issuerAttestation { confirmed: true; attestedAt: string }`, **excluded from the canonical signed payload**. Honest framing in UI + code: a good-faith log entry / procedural evidence — **not** a safety control, **not** legal immunity.
4. **No verification text in editable body** — cert face already system-prints the verify pointer + id + issuer disclosure (`render/src/template.ts:247-249`); confirm the LETTER renderer has an equivalent non-editable footer (add if missing).

### `[auto]` document number
After `allocateCredentialId`, the server substitutes the real number into `[auto]` (all fields) before render/sign. The unfilled-slot check treats `[auto]` as resolved. Issuer never types the number → face number always equals the record id.

### Verify-page honesty line (WS1)
Add to the verify page: *"We attest these are the exact bytes dmj.one issued; we do not independently audit the truth of the statements made in the document."* Separates integrity/authorship from factual accuracy.

---

# WS2 — Privacy hardening (touches the live verify/crypto core; security-critical)

### WS2-A. `erased` record state + true erasure
- **New record state `erased`** (top-level flag `erased: true` + `erasedAt`), distinct from revocation (which keeps content, marks invalid).
- **Repo gains `erase(id)`** (new `CredentialRepository` method — interface today has only `create/getById/exists/setStatus/list`). It:
  - **Purges PII:** `content.recipientName`, `content.intro`, `content.title`, `content.kicker`, `content.bodyParagraphs` / letter `recipientLines,subject,salutation,bodyParagraphs,valediction,reference`; the stored **`canonicalPayload` plaintext string** (contains the name); the rendered **certificate blob** AND the **`section63` blob**.
  - **Retains non-PII residue:** `id`, `pdfSha256`, `canonicalSha256`, `mldsaSignature`, `logSeq`, `logLeafHash`, `statusSignature`, timestamps, `erased/erasedAt`. These let the tombstone prove a document existed and was erased, with zero PII.
- **Every read path short-circuits on `erased` BEFORE any verification OR blob fetch** (`/c/:id`, `/v/:token`, `/api/verify`, `/api/verify/file`, `/evidence`, `/section63`, `/status`, AND `/api/download` — which otherwise 500s on the purged certificate blob, `app.ts:500-505`, a behavioral oracle): render a **content-free tombstone** ("This document was erased at the data principal's request"), or a PII-free `410` for `/api/download`; **never** recompute canonical bytes or verify the signature on an erased record (else the verifier returns `unknown` — `verifier.ts:67`, `verification.ts:59`). §63 regeneration is blocked on erased records (`credentials.ts:211` path).
- **Append-only log is untouched** — it stores only hashes (`SHA-256(canonicalSha256)` + id + `canonicalSha256`, `types.ts:250-257`, `log-append.ts:55`), no plaintext PII, so DPDP erasure and log immutability do **not** conflict. The plaintext lived only in `content` + `canonicalPayload`, which erase purges.
- **`rowToCredential` tolerates the redacted shape** (purged fields → null/empty) without throwing — required new invariant + test.

### WS2-B. Unguessable verify token (non-enumerable retrieval)
- **`verifyToken`**: ≥128-bit base64url from CSPRNG (`randomBytes`), generated at issuance, stored **top-level** on the record. **Never** in `computeCanonicalPayload` (would bump the frozen v1 + break every existing signature) and **never** in the `/evidence` output.
- **One uniform gate rule (resolves gap A — legacy vs uniform collision). The discriminator is whether the resolved record HAS a `verifyToken`:**
  - **Tokened record (ALL new issuance):** every read route returns PII/content ONLY when the matching token is supplied — `GET /v/:token` (page), `/api/verify` (`publicFields.recipientName`), `/api/verify/file` (file-hash verdict), `/evidence` (`content`+`canonicalPayload`), `/api/credentials/:id/section63` (embeds `recipientName`), `/api/credentials/:id/status`, and `/api/download` (in ADDITION to its password gate). Without the token → the **uniform generic response** (no PII, no existence/volume signal). A nonexistent id and a tokened-record-without-token are indistinguishable.
  - **Legacy record (pre-WS2, no `verifyToken`):** addressable by id behind the rate-limiter — their printed QR immutably encodes `/c/<id>` and `pdfSha256` forbids re-render. This finite, pre-existing set stays an existence/PII oracle by id — **explicitly accepted: it is no worse than today and cannot be closed without breaking already-issued documents.** (Optional backfill: give old records a token for future *re-shares*; printed QR stays id-based.)
- **Dedicated token route (resolves gap D — disambiguation):** new QR/link = `verify.dmj.one/v/<token>` (token in the PATH, not a query string → no referer/log leakage; no id in the URL at all). `GET /c/:id` stays the legacy human-id route: serves token-less legacy records, and returns the **uniform generic** for any id whose record HAS a token or does not exist (so new docs are invisible on `/c`). No fragile format-sniff on one param. The face still prints the human `DMJ-…` id for phone/BGV reference.
- **Timing-safe:** constant-time comparison via `crypto.timingSafeEqual` over the raw token bytes (NOT the Argon2 password path — that is for `/api/download`'s password, a different primitive); uniform response AND timing for valid-but-wrong vs nonexistent; the rate-limiter stays in front (`rate-limit.ts`).
- **Coupling kept intact:** download-by-password (`downloadSchema` needs `credentialId`, `app.ts:445-466`) and file-verify (`/api/verify/file` posts `credentialId`) keep their id/token input on the credential + download pages; only the **landing-page PII-lookup-by-number** is removed. The face prints the id, so these flows still work.

---

## Data flow
picker → fills form (client) → user edits `[slots]` → submit → `issue*Schema` (unfilled-slot + denylist + attestation) → allocate id + `verifyToken` → substitute `[auto]` → `assemble*Content` (+ store `issuerAttestation`, `verifyToken`) → existing sign / log / persist → verify by token; erase → tombstone.

## Error handling (uniform error schema; no partial issuance)
Leftover `[slot]` → 400 (field+token). Denylisted word → 400 (word+reason). Missing attestation → 400. Invalid/absent verify token on a PII route → uniform 404-style generic (no existence leak). Erase on already-erased → idempotent.

## Security & DPDP mapping
- §8(5) security → existing encrypted-at-rest + access control; token prevents bulk PII harvest.
- §8(7) erasure → WS2-A; exact retention clock `[lawyer-review]`.
- Hosting basis → issuer-attested consent (recorded) + WS2-A withdrawal/erasure; recipient-consent-as-proxy adequacy `[lawyer-review]`.
- Log immutability vs erasure → no conflict (hashes only); plaintext residue (`canonicalPayload`) is purged.
- `verifyToken` is a secret: top-level only, never signed, never in `/evidence`.
- No new third-party dependency; no new outbound network call.

## Testing
**WS1:** catalog lint (9 entries denylist-clean incl. IT-Act/CA terms; internship-group employment-free; each typechecks to `kind`); unfilled-slot unit (rejects single-bracket; allows leading `[[align:…]]` + `[auto]`); denylist unit (each term `\b`/case-insensitive; phrases; internship-scope only on internship issuance); schema integration (reject leftover/denylisted/no-attestation, accept clean); `[auto]` substitution (face id == record id); render (zero `[`, every field injected).
**WS2:** token ≥128-bit CSPRNG unique; for a tokened record **every** PII route (`/v`,`/api/verify`,`/api/verify/file`,`/evidence`,`/section63`,`/status`,`/api/download`) returns nothing without the matching token, and a missing-id vs tokened-without-token are byte/timing-indistinguishable (`timingSafeEqual`); legacy token-less records still resolve by id behind the rate-limiter (asserted, accepted); erased record → all read paths incl. `/api/download` show a PII-free tombstone/410 and DON'T attempt signature verify or blob fetch; `section63` + cert blob + `canonicalPayload` purged on erase; `rowToCredential` tolerates redacted shape; `verifyToken` absent from canonical payload AND `/evidence`; download + file-verify still work via the id/token input.
**No regression:** existing issuer/verify/crypto suites green; existing signatures still verify (canonical payload unchanged).

## Acceptance criteria (machine-checkable)
1. `DOC_TEMPLATES` has 9 valid entries; catalog lint passes (denylist incl. IT-Act/CA; internship-group employment-free).
2. Picker fills form, stays editable, confirms before replace.
3. Leftover `[slot]` / denylisted word / missing attestation → 400 each.
4. Clean attested template issues; record carries `issuerAttestation` + `verifyToken`; PDF zero `[`; verifies green **by token**.
5. No string claiming an IT-Act digital signature / CA / government recognition passes (lint + unit).
6. For a tokened (new) record, every read route (`/v`,`/api/verify`,`/api/verify/file`,`/evidence`,`/section63`,`/status`,`/api/download`) requires the matching token; without it a uniform generic response leaks neither PII nor existence; compare is `timingSafeEqual`. Legacy token-less records remain id-addressable behind the rate-limiter (accepted, on record).
7. `erase(id)`: every read path incl. `/api/download` renders a PII-free tombstone/410, no signature-verify or blob-fetch attempted; cert + `section63` blobs + `canonicalPayload` purged; revocation remains a separate state.
8. `verifyToken` is absent from `computeCanonicalPayload` output and the `/evidence` bundle; existing signatures still verify.
9. Verify page shows the integrity-vs-accuracy honesty line.
10. Download-by-password + file-verify still function; existing suites green.

## Assumption ledger (belief → status → source)
- No statutory format → HIGH (IndiaFilings; state Shops&Estab Rules structural check; 3-0). 7 non-experience types inherit by principle → assumed `[lawyer-review]`.
- Forgery = false authorship + intent; truthful issuer safe → HIGH (BNS §335/§336 India Code; *Sheila Sebastian* SC 2018; 3-0).
- Denylist exact wording → DERIVED (§335/§336 + IT Act §18) `[lawyer-review]`.
- Internship ≠ employment; avoid salary/PF/ESI → HIGH (Code on Wages 2019, IR Code 2020, Apprentices Act 1961, NatLawReview, *Irel India*; 3-0). EPF-exemption refuted; rests on no-statutory-category + reclassification.
- Issuer = Data Fiduciary → HIGH but un-adjudicated (DPDP §3(c)(i),§2(i); Cyril Amarchand FAQ; 3-0).
- §8(5)/§8(7) → HIGH (MeitY Gazette primary; 3-0).
- §7(a) issuing not public hosting → MEDIUM/FRAGILE (2-1; LiveLaw) → token + erasure + attested consent.
- Content fields, short/factual → MEDIUM (Indeed India, IndiaFilings, Keka; 3-0; experience-cert only).
- BGV via issuer contact; fails unreachable/overstated → MEDIUM (AuthBridge, Millow, SutraHR; 3-0).
- ML-DSA ≠ IT-Act digital signature → HIGH (IT Act §§3,24,35-36, Second Schedule; CCA IOG v4.0; 3-0). Consistent with [[anchor-wording-conditional-locked]].
- **Code facts (verified this session):** face system-prints verify pointer+id+disclosure (`template.ts:247-249`) → drop body footer. Verifier recomputes canonical bytes from `content` (`verifier.ts:67`; `canonical.ts:50-51`) → erase MUST short-circuit before verify. PII exposed by sequential id on `/c`,`/api/verify/:id`,`/evidence`,`/section63` (`page.ts:348-352`,`verification.ts:79`,`app.ts:802-806`,`section63-template.ts:175`) → gate all. IDs sequential/enumerable (`credential-id.ts:56`). Log stores hashes only (`types.ts:250-257`) → erasure/immutability compatible. QR/face bake `/c/<id>`, PDF immutable (`issue.ts:68` etc.) → legacy id-lookup retained for old docs. Repo has no erase (`contracts.ts:163-184`) → add method. download/file-verify keyed on `credentialId` → keep id/token input.
- Single fixed signatory; `ISSUER_LEGAL_NAME='dmj.one (independent educational initiative)'`; country IN.

## Open questions / `[lawyer-review]` before public reliance
1. Type-specific wording for the 7 convention-extended types.
2. Recipient-consent-as-proxy adequacy under DPDP §5/§6 (issuer ticking the box vs the data principal's own consent).
3. Exact DPDP retention clock (Rules 2025 class-specific).
4. Exact denylist wording + precise honest self-description of the cryptographic attestation.
5. Confirm the verify-portal landing UX (removing number-typing) hurts no real BGV flow given the face prints the id + QR carries the token.

## Phasing (bundled — ship together, per user choice)
- **WS1** (templates + content guardrails + verify-honesty line): no crypto-core change beyond adding `issuerAttestation`.
- **WS2** (token + erasure): security-critical; the code-grounded security re-review returned GO after the 4 follow-up fixes (A–D) above; must land WITHOUT changing `computeCanonicalPayload` (so existing signatures keep verifying).
- Both implemented under TDD, reviewed (experience + security + legal-standing lenses), then deployed together. Lawyer-review items resolved before public reliance.
