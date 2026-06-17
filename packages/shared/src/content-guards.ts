/**
 * Content guards — the issue-time safety core (pure; no I/O).
 *
 * Two checks back the boundary validators on `issueCredentialSchema` /
 * `issueLetterSchema`:
 *
 *  - {@link findUnfilledSlot}  stops a half-filled template ("[Name] interned
 *    from [start]") from being issued and cryptographically signed. Editable
 *    slots are single-bracket `[…]`; the renderer's leading `[[align:…]]`
 *    directive and the reserved `[auto]` document-number token are NOT slots.
 *  - {@link findDenylistedTerm}  stops a false-status / false-authority claim
 *    (the BNS §335/§336 misattribution risk and the IT-Act digital-signature
 *    overclaim) — an unregistered individual initiative must not call itself a
 *    "company", "registered", a "certifying authority", etc. Internship docs
 *    additionally must not imply employment/salary (substance-over-form).
 *
 * Validity of these documents rests on TRUE FACTS + a reachable issuer +
 * verifiability, not on wording; these guards police only the wording that
 * would misrepresent WHO issued it or WHAT dmj.one is — never the facts, which
 * only the human issuer can attest.
 */

/** Leading alignment directive — exact parity with `render/src/html.ts` ALIGN_DIRECTIVE (anchored, 4 enums). */
const ALIGN_DIRECTIVE = /^\[\[align:(?:left|center|right|justify)\]\]/;

/** The reserved token the server substitutes with the allocated document number after id allocation. */
const AUTO_TOKEN = /\[auto\]/g;

/** A bracket group (or a lone unmatched `[…`), used to surface the offending slot. */
const SLOT = /\[[^\]]*\]?/;

/**
 * The first unfilled `[slot]` in `text`, or null. A single LEADING valid
 * `[[align:…]]` directive is stripped (the renderer consumes it) and every
 * `[auto]` token is treated as already resolved; any remaining `[` is a slot.
 */
export function findUnfilledSlot(text: string): string | null {
  const stripped = text.replace(ALIGN_DIRECTIVE, '').replace(AUTO_TOKEN, '');
  const m = SLOT.exec(stripped);
  return m ? m[0] : null;
}

/**
 * Terms that misrepresent the issuer's legal STATUS or AUTHORITY. Always blocked.
 * Derived from BNS §335/§336 (false authorship/status) + IT Act §3/§35 (a
 * "digital signature" is CA-issued) — see the design doc's assumption ledger;
 * exact list is lawyer-review-flagged and intentionally over-blocks (rephrase).
 */
const STATUS_TERMS: readonly string[] = [
  // corporate / registration status this initiative does not hold
  'company', 'pvt', 'private limited', 'ltd', 'llp', 'corporation', 'incorporated',
  'registered under', 'registered', 'recognised by', 'recognized by', 'recognised', 'recognized',
  'accredited', 'affiliated', 'institution', 'institute', 'foundation', 'society', 'trust', 'ngo',
  'section 8', 'iso certified', 'iso-certified', 'cin', 'gstin',
  // government recognition
  'government approved', 'government-approved', 'government recognised', 'government-recognised',
  'government recognized', 'government-recognized', 'government registered', 'government-registered',
  'government backed', 'government-backed', 'government certified', 'government-certified',
  // signature / authority overclaim (the status this project most fears)
  'certifying authority', 'digital signature', 'dsc', 'secure electronic signature',
  'e-sign', 'esign', 'aadhaar e-kyc',
];

/** Employment/payment terms — blocked ONLY for internship-scoped issuance (internship ≠ employment). */
const INTERNSHIP_TERMS: readonly string[] = [
  'employee', 'employment', 'employed', 'salary', 'wages', 'payroll', 'stipend', 'pf', 'epf', 'esi',
];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The first denylisted term in `text` (canonical lowercase form), or null.
 * Word-boundary + case-insensitive, so "accompany" does not match "company".
 * Earliest position wins; on a tie the longer (more specific) term wins.
 * @param opts.internship also blocks employment/payment terms.
 */
export function findDenylistedTerm(text: string, opts?: { internship?: boolean }): string | null {
  const terms = opts?.internship ? [...STATUS_TERMS, ...INTERNSHIP_TERMS] : STATUS_TERMS;
  let best: { term: string; index: number } | null = null;
  for (const term of terms) {
    const m = new RegExp(`\\b${escapeRe(term)}\\b`, 'i').exec(text);
    if (!m) continue;
    if (best === null || m.index < best.index || (m.index === best.index && term.length > best.term.length)) {
      best = { term, index: m.index };
    }
  }
  return best ? best.term : null;
}
