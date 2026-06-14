# Court-Readiness & Security Assessment — dmj.one Trust Services

*Date: 2026-06-15. Method: 6-agent parallel audit (read-only code audit paired with primary-source legal/standards research), cross-validated. Every load-bearing legal citation verified against a primary or primary-adjacent source; one post-cutoff case (Pune Bar Assn, 2026) verified live.*

---

## Bottom line

The question "is this the most secure, verifiable, India-court-ready certificate platform, and how much is it lagging?" conflates **two different axes that have opposite answers**. The honest assessment must keep them separate:

- **Axis 1 — Cryptographic integrity / tamper-evidence: it LEADS the Indian market.** It ships in production two things *no licensed Indian CA ships at all* — a post-quantum signature (ML-DSA-87 / FIPS 204) and a public, append-only transparency log with signed tree heads. On "can't be forged or tampered without detection," it is at or beyond the domestic state of the art.

- **Axis 2 — Indian statutory legal recognition / court-readiness: it is ABSENT, by design.** It signs with a **self-signed key, not a CCA-licensed Digital Signature Certificate**, so the Bharatiya Sakshya Adhiniyam 2023 **§86 evidentiary presumption can never attach** to its signature, no matter how strong the math. This is not a backlog item; it is a **regulatory licensing gap**.

**One sentence:** *Best-in-class tamper-evidence; not a legally-recognized signature.* It is simultaneously a generation **ahead** on the axis the incumbents aren't competing on, and **not entered** in the race they dominate.

This matches the project's own stated ethos ("Court-ready, **honestly**. We claim exactly what we can prove") — and the audit confirms the in-product wording lives up to that. The overclaims that exist are confined to the README (see §6).

---

## 1. The tie-breaker (the fact that orders everything)

> **Can this platform's signature obtain IT Act §3/§3A/§5 recognition + the evidentiary presumption WITHOUT a CCA-licensed DSC or a licensed eSign/ASP integration?**
>
> **Verdict: NO. Definitively, and by design.** Corroborated independently from the recognition axis and the evidence axis.

Why, in plain terms:

- **IT Act 2000 §3** defines a digital signature as asymmetric crypto + hash. That supplies the *technique only*. It does **not** by itself confer legal operativeness or any presumption.
- **Legal recognition + the presumption** require (a) the public key bound to identity by a **Digital Signature Certificate from a CA licensed under the IT Act (Ch. VI)**, and (b) **"secure electronic signature" status** under **IT Act §15** (signature-creation data under the signatory's exclusive control, using a technique **notified in the Second Schedule**). The Second Schedule lists only **Aadhaar e-KYC eSign (via licensed ESP)** and **PKI DSC**.
- India PKI is a hierarchical trust chain rooted at **RCAI** under the **CCA**. Recognition is gated by **licensure, not cryptographic strength.** (23 licensed CAs; 7 eSign ESPs. Class 3 is the live DSC class; Class 2 sunset Jan 2021.)
- **The killer fact:** the **CCA Interoperability Guidelines v4.0** (current, 119 pp) whitelist **only** `SHA256withRSA` and `ECDSA-with-SHA256 (P-256)` across every certificate profile. **Zero** occurrences of ML-DSA / Dilithium / FIPS 204 / post-quantum / lattice.

So the platform's two signature legs fail for **two different, independent reasons**:

| Signature leg | Algorithm OK? | Why it still fails |
|---|---|---|
| RSA-3072 (self-signed cert) | ✅ RSA+SHA-256 *is* whitelisted | ❌ **Licensure** — self-signed, not a DSC chained to a CCA-licensed CA. Outside India PKI by definition. *(And in production it isn't even embedded — see §3.)* |
| ML-DSA-87 (detached, post-quantum) | ❌ Not in the IOG whitelist | ❌ **Algorithm** — absent from CCA guidelines, and a detached layer outside the X.509/PKCS#7 DSC framework entirely. |

**A third independent failure — key custody.** Even setting the signature legs aside, the **CCA "Security Requirements for Crypto Devices"** mandates the subscriber's signing private key live in a **Hardware Cryptographic Module validated to FIPS 140-2/3 Level 2 or higher** (non-exportable, CMVP-validated, tamper-zeroizing). The platform decrypts its keys **into Node process memory** at sign time (software-only). *(Note: Level 2+ is the subscriber tier; Level 3 is the CA/RCAI tier.)* So **CCA conformance fails on three independent, each-fatal axes: licensure, algorithm, and custody.** The verdict is over-determined.

**Two presumptions, not one.** A self-signed key forecloses **both** statutory presumptions: **BSA §86** (secure electronic record/signature) and **BSA §87** (an Electronic Signature Certificate's contents are correct — and the delivered PDF embeds *no* certificate at all, so there isn't even a §87 candidate). Both are **rebuttable** presumptions that *shift the burden* to the challenger — not "deemed concluded" — and both gate on the same CCA recognition the platform lacks.

**The irony to internalize:** the exact feature that makes the platform "most secure" (post-quantum ML-DSA) is a feature that **disqualifies** it from statutory recognition today, because the regulator hasn't notified any PQ algorithm.

**Is there any path where self-sovereign crypto *earns* recognition?** No. Recognition is **state-conferred** — a CCA license, or a Second-Schedule notification under §3A(2) — never earned by cryptographic strength. The floor cost is strictly **> ₹0**.

---

## 2. The three legal lanes (what "court-ready" actually means)

Court-readiness in India is not one thing. It splits three ways, and the platform sits differently in each:

| Lane | Requirement | Platform status |
|---|---|---|
| **Admissibility (BSA §63)** — gets the record *in* to be weighed | A hash value + a **§63(4) certificate** signed by the person-in-charge (Part A) **and an expert** (Part B). Does **not** require a "secure" signature. | ✅ **Supported.** The platform auto-generates this certificate. *But this is table-stakes — any electronic record gets in this way; it confers no unique standing.* |
| **Presumption (BSA §86 + §87)** — court *presumes* (rebuttably) the record unaltered/attributable (§86) and the signing certificate's contents correct (§87); **burden shifts to the opponent** | A **"secure electronic signature"** = Aadhaar eSign or CCA-licensed DSC (§3A/§15 + Second Schedule), and (for §87) a real Electronic Signature Certificate. | ❌ **Cannot earn either** without a licensed DSC/eSign. §86(2)(b): nothing else creates the presumption. No embedded certificate exists → no §87 candidate. |
| **Evidentiary weight** — persuasiveness *once admitted* | Whatever makes the record hard to impeach. | ✅ **This is where the Axis-1 crypto pays off legally.** Hash chain + transparency log + RFC-3161 timestamp + ML-DSA make the record hard to challenge even without the presumption. |

**What a litigant can actually do with a document from this platform:**

- **CAN:** get it **admitted** under §63; put **strong, independently-reproducible proof** of integrity before the court (the ML-DSA-87 signature verifies, the SHA-256 matches, the entry sits in a public append-only log, an RFC-3161 timestamp shows when the signature existed). Real, persuasive forensic evidence.
- **MUST STILL PROVE** (because there is no §86 presumption — the burden stays on the litigant): authenticity/integrity **as a fact** (the court will not presume it); the §63(2) foundational conditions via the Part A witness; that the signing key/system is what it claims (no CA vouches for identity — the transparency log + GitHub anchor *help* but are the litigant's evidence to explain, not a statutory shortcut).

**The §63(4) "expert" question** (operator self-attests as the Part B expert): **curable, not fatal.** The Supreme Court in *Pune Bar Association v. Union of India*, [2026 LiveLaw (SC) 551](https://www.livelaw.in/sc-judgments/2026-livelaw-sc-551-pune-bar-association-v-union-of-india-535951) (May 2026) **upheld §63(4)** and its hash-disclosure mandate, and held that **any person with special skill in computer science & cyber-forensics may sign Part B** — not only §79A-notified Examiners ([Verdictum](https://www.verdictum.in/supreme-court/qualification-section-39-bsa-not-restricted-section-79a-it-act-examiners-forensics-sign-part-b-certificate-1614860)). **[VERIFY-WITH-COUNSEL]** — this ruling is ~3 weeks old and was confirmed from legal-news reporting (LiveLaw, Verdictum), not the primary judgment text; the date varies by source (order ~22 May, reported 28 May). Confirm against the primary judgment before any court reliance. (The rest of the statutory chain — BSA §63/§86/§87, IT Act §3A/§15/Second Schedule, *Anvar* 2014, *Arjun Panditrao* 2020 — is from primary/bare-act sources and carries no such caveat.) Same-person Part A/Part B is **not a per-se violation**; it goes to **weight** in a *contested* matter and is cured by producing a genuinely independent expert at trial (the crypto facts are reproducible by any competent expert). The platform actually **aligns well** with this ruling: the SC now *mandates* hash disclosure (the platform provides it) and *permits* a non-notified expert (the operator-as-expert is legally occupiable).

---

## 3. Axis 1 — Cryptographic integrity (where it LEADS, and the honest caveats)

**What it ships (verified in code):**

- **Post-quantum signature:** detached **ML-DSA-87 (FIPS 204)** over a canonical payload binding content + `pdfSha256`. (README says "ML-DSA-65" — **stale**; code is 87, CHANGELOG logs the 65→87 upgrade.) No algorithmic bug found; canonical binding is sound (one shared `computeCanonicalPayload` on both sides).
- **Public transparency log:** hash chain + ML-DSA **Signed Tree Heads**, append serialized in a transaction. Tamper-evident.
- **Offline evidence bundle:** self-contained JSON (canonical payload + signature + public keys + signed head + timestamp + verify instructions) an opposing expert can re-run **without access to dmj.one**.
- **1-bit tamper detection** on uploaded files (real SHA-256 compare); strong app-security (WebAuthn + TOTP + Argon2id recovery, lockout-proof passkeys, fail-closed bootstrap token, hash-chained audit log).

**vs the Indian market:** every capability above is **empty for the entire Indian licensed-CA market.** eMudhra is the only domestic player with even a *PQC roadmap* (not production) — this one is directly verified; the **transparency-log/anchoring absence for the other players is a reasonable inference** from their public material, not an exhaustively-confirmed negative. Closest analogue **anywhere** is Certificate Transparency (RFC 6962) — and that's global WebPKI/TLS infrastructure, not Indian document signing.

**The honest caveats (verified — these are real, and the audit credits the in-app honesty about most of them):**

1. **"Verifiable without trusting us" overstates it.** Integrity *is* independently verifiable offline. But **issuer identity rests on a self-published key** — to know the key belongs to dmj.one you must get it *from* dmj.one. No CA, no third-party identity binding. (Self-asserted provenance.)
2. **Production delivers no in-PDF signature at all — by deliberate design.** All three issuance pipelines deliver the PDF **byte-identical to the render with no embedded PKCS#7** (`padesCertFingerprint=''`). Embedding was **affirmatively removed** (hybrid-signer.ts:1-27): a self-signed PAdES object made Adobe/Edge built-in viewers flash an **"Invalid Signature / Document modified"** banner that alarmed recipients, so it was pulled; the embedder (`ForgePadesSigner`) now runs only in tests. Consequence: open a delivered certificate in Adobe → **no signature panel.** Verification is entirely out-of-band (verify.dmj.one / evidence bundle). Defensible as a model, but it collides with what registrars/judges expect to *see* — and the fix is **not** re-enabling the self-signed embed (the banner returns) but embedding a **viewer-trusted licensed-CA** signature. It also means **PAdES-LTV (B-LT/B-LTA) is moot** — no embedded signature to attach DSS/VRI/archive-timestamps to (and a self-signed cert caps any embed at B-B/B-T, which even lacks the mandated signing-certificate signed attribute).
3. **Revocation is an unsigned, mutable, live-only flag.** No CRL/OCSP/status-list. `status` is **not in the signed canonical payload** (verified — `canonical.ts` covers content + `pdfSha256`, never status) and revoke never re-signs. Consequences: (a) even a live "revoked" answer is **not court-provable** the way a signed CRL/OCSP response is; (b) in the offline evidence bundle, `status` rides along only as an **unsigned `meta` field** (app.ts:745) and the bundle's **five scripted `howToVerify` steps don't check it** (app.ts:776-784 verify canonical-hash / ML-DSA / timestamp / log / file-hash — none reference status), so **a verifier following the steps as written passes a revoked credential as valid**, and the signed material itself carries no cryptographic trace of revocation; (c) a held PDF/bundle re-verifies VALID forever if verify.dmj.one is down; (d) the downloadable **§63 cert is served stale** for revoked credentials (the verify *page* says REVOKED, the PDF doesn't).
4. **OpenTimestamps/Bitcoin anchoring is a non-functional stub** (`makeOtsStub` = `base64(sha256(...))`, hardcoded `pending`, never submits to a calendar). The only real external anchor is a **GitHub commit gated on the operator's own token** — corroborating, not third-party-independent. *Credit:* the live verify page and §63 deliberately **never surface** OTS/Bitcoin (tests enforce the absence), so the user-facing trust UI does not lie — but the **README does** ("anchored to Bitcoin via OpenTimestamps").
5. **Transparency-log inclusion** is leaf + signed-head only; **no Merkle audit-path proof** yet (honestly disclosed).

---

## 4. Axis 2 — Compliance & deployability for court/government use

Strong application-security engineering, but **three hard, independent blockers** for any actual court/government deployment (the first two are architectural, not config):

| Blocker | Finding | Severity (vs court/govt goal) |
|---|---|---|
| **Key custody** | Signing keys (ML-DSA + self-signed PAdES key) are AES-256-GCM-sealed at rest, then **decrypted into Node process heap** at sign time (exportable plaintext in memory). No Cloud KMS, no HSM. **CCA "Security Requirements for Crypto Devices" mandates the subscriber signing key live in a FIPS 140-2/3 Level 2+ hardware module, non-exportable** — this is the *third* independent CCA-conformance failure (see §1). | CRITICAL |
| **Data residency** | Region hardcoded **`asia-east1` = Taiwan**, not India. Firestore + Secret Manager + Cloud Run all offshore. Fails **MeitY** government-data localization (must host in India). | CRITICAL |
| **CERT-In + DPDP** | No NIC/NPL **NTP time-sync** (doubly serious for a system whose value is *timestamps*), no 6-hour breach-reporting path, logs not retained 180 days **in India**; PII (`recipientName`) present with no consent capture, retention policy, or erasure path. | HIGH |

*Credit where due:* auth posture is genuinely strong (no forger-mints-valid-doc path found **within this scoped review — a full adversarial pentest was deliberately out of scope**); the audit log is genuinely hash-chained and tamper-evident; Firestore rules deny all client access (server-only); deploy uses keyless WIF. Minor: CI `pnpm audit` is `continue-on-error` (doesn't fail on high/critical), no DAST step; issuer image not distroless/read-only.

> **Note on DPDP cross-border:** the DPDP Act 2023 §16 is a *negative list* (transfers allowed unless the country is restricted), so Taiwan residency is not a DPDP violation *per se* — but **MeitY government-data localization** independently fails it for govt/court use.

---

## 5. Consolidated gap register (severity-ranked, axis-tagged)

Deduplicated across all six auditors. Severity is **relative to the stated goal of "court-ready"** — against the platform's *honest self-positioning* (strong evidence, not a recognized signature), many of these are scope, not defects.

### A. Legal recognition (Axis 2) — the categorical gap
| # | Gap | Sev |
|---|---|---|
| A1 | No statutory recognition / no automatic §86 presumption: self-signed key + non-whitelisted ML-DSA = not a "secure electronic signature." | HIGH (categorical) |
| A2 | Production delivers no embedded digital signature in the PDF (out-of-band verification only) — fails the registrar/judge "show me the signature panel" expectation. | MED |
| A3 | §63(4) Part B expert self-attested by the operator — curable, but a weight risk in a contested matter if left unaddressed. | MED |
| A4 | Stale citations: docs reference repealed IEA §85B/§85C — migrate to BSA §86/§87 before any court-facing claim. | MED |
| A5 | Part B doesn't state the signatory's CS/cyber-forensics credential (the exact "unimpeachable material" *Pune Bar Assn* wants). | LOW |

### B. Cryptographic verifiability (Axis 1) — strong, with real holes
| # | Gap | Sev |
|---|---|---|
| B1 | Issuer identity self-asserted (self-published key, no CA/third-party binding). | HIGH |
| B2 | Revocation unsigned & not in the signed canonical payload (`status` rides as an unsigned `meta` field the scripted verify steps don't check) → a verifier following the bundle steps passes a revoked credential; live "revoked" not court-provable. | HIGH |
| B3 | No offline/durable revocation (no CRL/OCSP/status-list); revocation depends on verify.dmj.one being online. | HIGH |
| B4 | §63 certificate served stale for revoked credentials (diverges from the verify page). | MED |
| B5 | No Merkle inclusion proof (leaf + signed-head only). | LOW |
| B6 | RFC-3161 TSA certificate not chain-validated to a public root (message-imprint + token signature only; honestly disclaimed in code). Fine as forensic evidence, insufficient for an unattended time presumption. | LOW |

### C. Compliance / ops (court/govt deployment)
| # | Gap | Sev |
|---|---|---|
| C1 | No HSM/KMS — signing keys decrypted into process memory. | CRITICAL |
| C2 | Data residency: Taiwan, not India (MeitY localization). | CRITICAL |
| C3 | CERT-In: no NIC/NPL NTP sync, no 6-hr breach path, logs not 180-day-in-India. | HIGH |
| C4 | DPDP: no consent capture, retention policy, erasure path, or soft-delete on PII. | HIGH |
| C5 | CI `pnpm audit` non-blocking; no DAST. | MED |

### D. Honesty / documentation (cheap, high-trust-value)
| # | Gap | Sev |
|---|---|---|
| D1 | README overclaims: "ML-DSA-65" (is 87), "anchored to Bitcoin via OpenTimestamps" (stub), "without trusting us" (identity self-asserted), "hybrid-signed" implying an embedded signature that isn't delivered. **In-code doc drift too:** `contracts.ts` HybridSigner JSDoc and `types.ts:148` describe an embedded PAdES PKCS#7 the runtime no longer produces. Runtime is honest; the docs aren't. | MED (trust) |
| D2 | `padesCertFingerprint=''` makes the upload-flow PAdES check dead code (harmless drift). | LOW |

---

## 6. What should be present — prioritized roadmap

### The one move that buys legal recognition
- **Sign the delivered PDF with an embedded PAdES signature backed by a Class-3 organisational "Document Signer Certificate" (DSC) from a CCA-licensed CA.** *(Effort: M→L — not a one-line switch. See the two parts below.)*
  - **Two parts, be honest about both:** (a) **build the embedded-PAdES production signing path** — today production embeds *no* signature at all (§3 caveat 2); the placeholder/incremental-signing code (`pades-signer.ts`, `placeholder-signature.ts`, `ForgePadesSigner`) exists but is **test-only/dormant**, so it must be wired into the live issuance pipelines and tested; and (b) **integrate the licensed CA's signing backend** (USB token / HSM / cloud-signing API) in place of the self-signed key. The `Signer` interface is pluggable (the socket exists), but the production embedded-signing path and the external CA integration **do not** — this is real engineering (M→L), not a config change.
  - **Why a DSC and not eSign:** it matches the **issuer-attestation** model (the org signs, unattended, many docs). eSign/Aadhaar is **signer-centric** (the individual holder signs) — a different product. eSign could be *added* for an optional holder counter-signature, but it does not make the *issuer's* signature recognized.
  - **Differentiator-preserving:** ML-DSA-87 and the transparency log are **independent layers** that sit alongside the PAdES signature. Adding a licensed-DSC embedded signature keeps the post-quantum + public-auditability USP **fully intact**. This is the *only* recognition path that doesn't cost the differentiators.
  - **The catch:** a Class-3 org Document Signer DSC is a **recurring paid item** (₹ thousands/year + token/HSM). **This collides head-on with the ₹0 budget constraint** — by the user's own rule, "any always-on or metered paid resource is a bug." See §7.

### Crypto / verifiability hardening (mostly free, high-value, keeps the self-sovereign model honest)
- **(S)** Fix the README to match the careful in-app wording (D1) — name the GitHub-only anchor and the self-published-key dependency. Closes the only place the project overclaims.
- **(M)** **Signed, dated revocation artifact** — issuer ML-DSA over `{credentialId, status, asOf}`, returned by verify and embedded in the bundle. Makes "revoked on date X" provable. The minimum CRL/OCSP-equivalent. (Closes B2a.)
- **(S)** Put `status` in the bundle with a "unsigned — re-check live" note + a status step in `howToVerify`. (Closes B2b's silent-accept.)
- **(M)** Published, signed, edge-cacheable **status list / OCSP-style endpoint** so revocation is durable and checkable without a live DB hit. (Closes B3.)
- **(S)** Regenerate (or stamp "see live status" on) the **§63 on revoke**. (Closes B4.)
- **(L)** **Real OpenTimestamps** — submit head hashes to a calendar, persist the upgradeable `.ots`, surface `confirmed` only after Bitcoin confirmation. Turns the stub into a genuine third-party-independent timestamp. (Closes B-anchor.)
- **(M)** Merkle inclusion proofs in the bundle. (Closes B5.)

### Legal hygiene (cheap)
- **(S)** Migrate §85B/§85C → **BSA §86/§87** across docs (A4).
- **(S)** State the Part B signatory's CS/cyber-forensics credential + cite *Pune Bar Assn (2026)* in Part B — converts a defensive posture into a cited, affirmative one (A5).
- **(M)** Optional **"independent expert" mode** — a distinct named/credentialed expert populates Part B for high-stakes documents (A3).

### Compliance (only if the target becomes actual govt/court deployment — all carry cost)
- **(L)** Cloud **KMS/HSM-backed signing** — keys non-exportable in a **FIPS 140-2/3 Level 2+** module for the subscriber key (L3 is the CA/RCAI tier). The single most important custody upgrade, and mandatory for any licensed-DSC path (C1).
- **(M)** **India-region** deployment (`asia-south1` Mumbai / `asia-south2` Delhi) + Firestore/SM/logs in-India (C2) — *paid.*
- **(S)** NIC/NPL **NTP sync** + documented clock discipline (C3).
- **(S/M)** CERT-In 6-hr breach runbook + 180-day in-India log retention (C3).
- **(M)** DPDP: consent record, retention schedule, erasure endpoint, `deletedAt` soft-delete (C4).
- **(S)** CI: make `pnpm audit` fail-closed on high/critical; add DAST/ZAP (C5).

---

## 7. The strategic fork (the real decision)

Every Axis-2 recognition path and most compliance blockers are **recurring paid items**. Against a **₹0 budget**, this is a genuine fork, and it's the user's call, not an engineering one:

- **Option A — Stay self-sovereign (₹0).** Keep the honest positioning: *the most tamper-evident, post-quantum, publicly-auditable certificate system in India* — strong, court-**presentable** evidence (BSA §63 + expert testimony), not a law-recognized signature. Spend the free effort on §6's crypto/verifiability/honesty items (revocation artifact, real OTS, README fixes, BSA citations). **This is a coherent, defensible, genuinely-leading product** — just not one that carries the §86 presumption or works where a Class-3 DSC is mandated (GeM, MCA/ROC, GST, judicial e-filing).
- **Option B — Buy recognition (> ₹0).** Build the embedded-PAdES production signing path and integrate a Class-3 org Document Signer DSC (and, for govt, move in-India + add HSM). This unlocks the §86 presumption and DSC-mandated workflows **while preserving the PQ + transparency-log differentiators**. Cost is recurring (breaks the current budget rule) **and** it is real engineering, not a flip — see §6 ("two parts").

**Recommendation:** ship Option A's free hardening now (it closes real holes and costs nothing), and treat Option B as a **bounded, budget-gated project (M→L, not a config switch):** wire the dormant embedded-signing code into production and integrate a licensed DSC backend. The good news is **no rewrite is needed** — the architecture (pluggable `Signer`, independent ML-DSA + log layers) accommodates it cleanly; the work is building the embedded-signing path that production currently skips and connecting an external CA. Architecturally ready; not yet built.

---

## Appendix — verdict per auditor

- **CryptoSign (Axis 1):** crypto is strong, no algorithmic bug; production reaches no PAdES baseline (no embedded signature); ML-DSA-87 authoritative; honest evidence-bundle disclaimer.
- **LegalEvidence (Axis 2):** §63 cert is sound for admissibility and unusually honest (correct §86 citation, no overclaim); admissibility ≠ presumption; self-attested expert curable (affects weight).
- **CATrust (tie-breaker):** definitive NO — recognition is licensure-gated; IOG v4.0 whitelists only RSA/ECDSA; ranked Class-3 DSC as the differentiator-preserving path.
- **VerifyRevocation (Axis 1):** integrity offline-verifiable; identity self-asserted and revocation unsigned/live-only — a revoked credential silently passes offline checks.
- **SecOps (compliance):** strong auth; three hard blockers — no HSM, Taiwan residency, CERT-In/DPDP unmet.
- **CompetitiveBar (ruler):** ahead of ~100% of the Indian market on Axis 1; 0/4 recognition capabilities on Axis 2; the gap is regulatory, not technical.
