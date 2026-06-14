# Design — Zero-Cost Court-Admissibility & Robustness Hardening (v2, post-review)

*Date: 2026-06-15. Tier: **Heavy**. Status: REVISED after 4-lens adversarial review (pre-mortem / YAGNI / ambiguity / security) — awaiting user approval. No implementation until approved.*

Derived from [court-readiness-assessment.md](../court-readiness-assessment.md). Goal: maximally **robust, court-admissible, tamper-evident** at **₹0** (no recurring/metered cost). Out of scope (cost money, untouched): CCA-licensed DSC, HSM/KMS, India-region, eSign, CERT-In infra.

North star (unchanged): raise **evidentiary weight + admissibility + integrity proof**; do **not** fake the §86/§87 statutory presumption.

---

## What the review changed (why v2 ≠ v1)

The v1 spec had a structural flaw and several over-reaches. All four reviewers converged:

- **The verify service is signing-keyless and must not write anchors/credentials.** v1 repeatedly had verify *sign* and *persist*. Unbuildable. **All new signing + credential/anchor writes are ISSUER-side; verify only serves stored blobs.** (It still writes its own audit events, as today.)
- **Three v1 items were security regressions or needed infra that doesn't exist** → moved to DEFER: the genesis-replay inclusion proof (PII enumeration + O(N) DoS on a public no-store endpoint), server-side OTS Bitcoin-header verification (SSRF/trust dep + live-fetch egress ban; *no scheduled job exists* to persist upgrades), and the aggregate signed revocation list (needs an issuer-signed singleton store; the per-cert assertion already meets the goal).
- **One item was a no-op with permanent cost** → CUT: TSA-root bundling / `tsaChainValidated` (a never-invalidating flag; the bundle already honestly delegates chain validation to the relying party who holds the chain in-token).
- **Chromium §63 re-render must never gate revocation** (it would brick the one safety-critical op).

Result: a tighter core that still closes the real holes, plus an honest deferred list.

---

## Non-negotiable invariants (from review)

1. **Verify never signs and never writes credential/anchor data.** New signatures + writes are issuer-only. (Verify may still write audit, unchanged.)
2. **Never alter the live credential canonical payload.** `CANONICAL_PAYLOAD_VERSION=1` is in production; changing those signed bytes turns *every issued credential* into `unknown`. New signed messages are **domain-separated** greenfield blobs.
3. **Nothing on the revoke path may block the status flip.** Status-flip + signed status assertion (pure compute) *is* the revocation and is fatal-on-failure; everything else on revoke (§63 re-render) is best-effort + loud audit.
4. **No public endpoint returns an unbounded response or enables amplification.**

---

## SHIP NOW — core (₹0, buildable, no posture regression)

### WS1 — Honesty & doc hygiene  *(S, low risk)*
- `README.md`: `ML-DSA-65`→`87`; drop "hybrid-signed"/embedded-PKCS#7 implication (state the **detached** model); "without trusting us" → name the **self-published-key** dependency (integrity is trustless; issuer *identity* is not); the OpenTimestamps/Bitcoin line is rewritten to match exactly what WS4 ships (see WS4 fork) **in the same change**.
- `packages/shared/src/contracts.ts` (HybridSigner JSDoc) + `types.ts:142-170` (`HybridSignatureResult`): correct "PAdES PKCS#7 embedded" → delivered PDF embeds **no** signature; ML-DSA detached; `padesCertFingerprint=''` in prod.
- **Acceptance:** no "ML-DSA-65" anywhere; no doc claims an embedded signature in delivered certs; README OTS line matches shipped behavior; suite green.

### WS2 — §63 strengthening  *(M, court-facing — preserve locked rules)*
Locked rules preserved: §86 not §85B; conditional "Where external anchoring is enabled"; **no** OpenTimestamps/Bitcoin/"independent (public|external) (repository|system)" on the §63 face. (Verified against `section63-template.test.ts:111,138-139`.)
- **Part B wording** (`section63-template.ts:294`): → "special skill and expertise in **computer science and cyber forensics** (and in the cryptographic methods described)". Keep the self-attestation paragraph (:300) + "(self-attested)" block (:325). *Pune Bar Assn (2026)* stays a **[VERIFY-WITH-COUNSEL] code comment** (:220-225) only — **not** on the PDF face (D1).
- **§87 + "rebuttable"**: add one clause after the §86 sentence (:311): also not an Electronic Signature Certificate whose contents are presumed correct under **§87 BSA 2023** (no CCA certificate is issued; the delivered PDF embeds none); both presumptions are **rebuttable**. Keep "Section 86 of the Bharatiya Sakshya Adhiniyam, 2023" verbatim (test:111); `not.toContain('Section 85B')` stays green.
- **Regenerate §63 on revoke = BEST-EFFORT (never gates the flip).** After the status flip + signed assertion, re-render+re-store the §63 blob (now showing "Revoked" + a revocation-date row, gated on `status==='revoked' && revokedAt`). A Chromium failure here is logged to the **audit trail loudly** and does **not** fail the revoke (the live page already shows REVOKED from `record.status`, template:254). *(Alternative considered: render §63 on-demand at serve-time — heavier per-request; chose store-on-revoke + best-effort.)*
- **Acceptance:** Part B names "computer science and cyber forensics"; disclosure names §86 **and** §87 + "rebuttable"; locked guardrail tests stay green; a revoked record's §63 HTML shows "Revoked" + date; revoke succeeds even if re-render throws (audited).

### WS3 — Per-credential provable revocation  *(M, ★ highest value)*
Closes the real gap: today the offline bundle carries `status` as **unsigned, uncheckable** metadata (app.ts:745) with no verify step — a revoked cert's bundle passes every embedded check.
- **Domain-separated signed status assertion (issuer-minted).** New `canonical.ts` builder + `STATUS_PAYLOAD_VERSION=1`. Signed bytes = `utf8("dmjone/status/v1\n" + canonicalJson({v:1, asOf, credentialId, status}))` where **asOf = the status-change instant** (`createdAt` for valid, `revokedAt` for revoked). The domain prefix is mandatory (prevents any cross-protocol confusion with credential payloads — by construction, not luck). Signed with the existing issuer ML-DSA key.
- **Minted in two issuer places:** `issue.ts` (initial `valid` assertion onto the record) and the revoke route (`credentials.ts:199`). **Signing failure here is fatal** to that op (pure compute; safe to be fatal).
- **Stored:** add `statusSignature?: {value, asOf}` to `CredentialRecord` (types.ts) **and** `rows.ts` omit-on-absent (mirror `tsaTimestampToken` at rows.ts:63) so it survives the Firestore round-trip.
- **Served keyless** by verify at `GET /api/credentials/:id/status` → `{credentialId, status, asOf, signature: string|null, mldsaPublicKeyId, legacyUnsigned?: true}`. Verify only **echoes the stored signature** (no signing). **Legacy records** (no signature) → `200 {…, signature:null, legacyUnsigned:true}` (NOT 500). One-time issuer backfill optional. `Cache-Control: public, max-age=60, stale-while-revalidate=300` (revocation is a living fact; short TTL + `asOf` freshness; the **verdict** path `/api/verify/:id` stays uncached).
- **Bundle:** add `status: {value, asOf, signature}` to `buildEvidenceBundle` as a **checkable** field + a `howToVerify` step ("verify the status signature with the issuer key over `dmjone/status/v1\n`+canonical; then re-confirm live at `/status` — revocation is a living fact").
- **Verdict precedence unchanged** (`deriveOutcome` still gates on the live `notRevoked`); this makes the answer *provable*, not different.
- **Acceptance:** issue stamps a verifying `statusSignature`; revoke updates it to `revoked`+`revokedAt` and re-signs; `/status` signature verifies under the issuer key and **fails on any tamper** to `status`/`asOf`/`credentialId`; legacy record returns `legacyUnsigned` 200; bundle status field verifies + tamper-fails; a status-assertion blob cannot be replayed as a credential signature (domain-tag test).

### WS6 — CI fail-closed `pnpm audit`  *(S)*
- `ci.yml:56`: remove `continue-on-error` so high/critical advisories fail CI. Add `--audit-level=high` + a **reviewed, time-boxed ignore file** (documented override) so one unfixable transitive advisory can't permanently block a revoke-hotfix deploy for a solo ₹0 maintainer.
- **Acceptance:** an introduced high advisory fails CI; a documented ignore entry lets a known-reviewed advisory pass.

---

## WS4 — Real OpenTimestamps — **PARKED (2026-06-15)**

> User chose **option A** (real stamping). On the A2 spike, `javascript-opentimestamps`
> proved unusable: **LGPL-3.0** (violates "no GPL in proprietary"), last published
> **2022** (unmaintained), and a vulnerable dep tree (`request`, `web3@0.18`,
> `fs@0.0.1-security` squatter) that would **fail the WS6 fail-closed audit gate**.
> So WS4 is **parked**, the fake stub was **removed** (WS1), and the README no longer
> claims Bitcoin anchoring. To unpark: hand-roll a tiny **dependency-free OTS
> calendar-HTTP client** (submit the 32-byte digest, persist the genuine receipt) —
> or formally adopt option B (drop the claim). Decision for the user when awake.
>
> **When unparked, these are hard constraints (pre-mortem O1/O2/O4/O5):**
> - **Stamping must mirror the TSA discipline** (tsa.ts): run **after** the record
>   is persisted (issuance already succeeded), explicit per-call timeout + total
>   cap, **swallow every error to "no receipt," never awaited on the critical
>   path.** Acceptance must include an *"issuance succeeds when a calendar hangs"*
>   test (not just "unreachable"). Cap the **combined** TSA+OTS issue-path egress.
> - **The upgrade write must be transactional + non-downgrading** (never
>   confirmed→pending; only advance). `anchorRepo.save` is today a blind
>   `doc(seq).set()` with no optimistic concurrency — two scheduler runs (Cloud
>   Scheduler can double-fire) or a run racing a re-publish will clobber. Add a
>   two-upgrades-of-one-head concurrency test.
> - **Bound the stored receipt size** (don't keep both pending+confirmed copies);
>   note growth in the assumption ledger.

## WS4 — Real OpenTimestamps — original options (for reference)

The current `makeOtsStub` is a placeholder (anchor.ts:116) and the README claims Bitcoin anchoring that doesn't exist. The review showed **full** real-OTS (our own pending→confirmed upgrade + server-side Bitcoin verification) needs a scheduled job that **does not exist** + risks live-fetch egress bans + an SSRF/trust dep. Three honest ₹0 options:

- **(A) Real stamping only (recommended).** Issuer submits `SHA-256(headHash)` to free public OTS calendars at anchor time (best-effort, timeout-bounded, never blocks issuance), and stores the **real serialized `.ots` pending receipt** (`javascript-opentimestamps`, gated on a license/maintenance spike — assumption A2). The bundle/verify emit the **real receipt** and say "submitted to OpenTimestamps — *upgrade & verify the attached `.ots` yourself* with the standard OTS client." This makes the claim **true** and gives a genuinely Bitcoin-anchorable, relying-party-verifiable receipt, with **no new infra, no explorer, no egress-ban risk** — we simply stop emitting a fake and emit a real receipt. Our own "confirmed" badge + server-side verification are deferred.
- **(B) Drop the claim.** Remove OpenTimestamps/Bitcoin from the README; keep the real GitHub-commit anchor as the sole external anchor (already honest, already surfaced). Zero new dependencies.
- **(C) Full real OTS.** A + our own upgrade-to-confirmed via a new **Cloud Scheduler** issuer job (free tier: 3 jobs) + server-side receipt verification. Most complete; most moving parts; revisit the egress/trust mitigations. Larger.

**Recommendation: (A).** It satisfies "real OTS / Bitcoin-anchored, verifiable without trusting us" at ₹0 with no new infra, and (C) can layer on later.

---

## DEFER (documented; not this pass) — with the reason each was cut

| Item | Why deferred (reviewer) |
|---|---|
| Aggregate `/api/status` signed list | Per-cert assertion already meets the goal; needs an issuer-signed singleton store + `listRevoked()`; "thin add," no named court scenario (Yagni, PreMortem B1, Ambiguity B3). |
| Evidence-bundle chain inclusion proof | Genesis-replay = recipient-base **PII enumeration** + O(N) DoS on a public no-store endpoint; only safe with a checkpoint bound, and only meaningful alongside a stable external anchor checkpoint (Security B1, PreMortem B3, Yagni). Revisit with WS4(C). |
| Server-side OTS Bitcoin-header verification | SSRF/trust dep + live-fetch egress ban during the multi-hour pending window; no scheduled job exists (Security B2, PreMortem N1, Yagni). Relying party verifies the real `.ots` themselves under option A. |
| TSA chain validation / `tsaChainValidated` | **CUT** — never-invalidating no-op flag + permanent root-rotation cost; bundle already delegates this honestly to the relying party (Yagni). |
| ZAP DAST in CI | Recurring false-positive triage = human cost; scope-adjacent to court-admissibility; CodeQL SAST + nonce-CSP already present (Yagni). |

---

## Cross-cutting

- **Sequencing / worktrees:** WS1 → WS2 → WS3 → WS6, then WS4 per the chosen option. WS3 + WS4 both extend the bundle/types → one owner serializes the bundle-shape merge; overlapping work on separate worktrees.
- **TDD throughout; the 237-test suite stays green** (no regression); e2e pipeline passes. New crypto gets round-trip + tamper-detection + never-throws + **domain-separation** tests.
- **Security (defending-in-depth):** no new secret surface; status signing reuses the issuer key **with a domain tag**; new endpoint is read-only, keyless, rate-limited (reuse `rate-limit.ts`), short-TTL-cached, exposes only already-public status. No change to auth/superadmin/key custody. Verify stays signing-keyless + non-anchor-writing.
- **Performance:** `/status` is O(1), edge-cacheable (≤60s); no unbounded responses; no hot-path regression.

## Acceptance criteria (rollup)
1. `pnpm -r build` + `pnpm -r test` + e2e green (237 baseline, no regression).
2. WS1: no "ML-DSA-65"; no embedded-signature claim; README OTS line matches shipped option.
3. WS2: Part B = "computer science and cyber forensics"; disclosure has §86+§87+"rebuttable"; locked guardrail tests green; revoked §63 shows "Revoked"+date; revoke survives a re-render failure (audited).
4. WS3: status assertion verifies + tamper-fails + domain-separated; legacy → `legacyUnsigned` 200; bundle status checkable; `/status` cache headers correct.
5. WS6: high advisory fails CI; documented ignore works.
6. WS4 (chosen option): claim is true and honestly surfaced; issuance survives calendar outage.

## Assumption ledger
- **A1** ₹0 holds: OTS calendars free; `/status` on existing Cloud Run; no paid infra in the core (WS4-C's Cloud Scheduler free tier only if chosen). *(Confirmed.)*
- **A2** `javascript-opentimestamps` usable + acceptably licensed — **SPIKE before WS4(A/C)**.
- **A3** Verify stays signing-keyless + does not write anchors/credentials (writes only audit, as today). *(Decided — invariant 1.)*
- **A4** D1: *Pune Bar Assn* cite stays off the PDF face pending counsel. *(User-confirmed.)*
- **A5** Domain separation for status assertions is **decided**, not optional (invariant 2). *(Decided.)*
- **A6** Reusing the issuer ML-DSA key (domain-tagged) for status assertions is acceptable; a separate status key is a later option.
- **A7** No India-region / HSM / DSC / eSign here — budget-gated, untouched.
