/**
 * Minimal HTML utilities shared by the certificate and §63 templates.
 *
 * Every value drawn from {@link CredentialContent} (or any caller-supplied
 * string) is hostile until escaped: a recipient named `A & <b>B` would
 * otherwise corrupt the document or inject markup. Per the project security
 * standard ("output encoding on all user content; no raw HTML injection"), all
 * interpolation goes through {@link escapeHtml}.
 */

const ESCAPE_MAP: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escape the five HTML-significant characters in untrusted text. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch] ?? ch);
}

/**
 * Escape untrusted text, then compile a bounded `**word**` → `<strong>` mini
 * markup for DISPLAY only. The reference certificate bolds key terms (company,
 * role, dates); this restores that fidelity without permitting raw HTML.
 *
 * Safety rests on order: {@link escapeHtml} runs FIRST, so by the time the
 * `**…**` rule applies, every `<`, `>`, `&`, `"`, `'` is already an entity and
 * the only literal characters left are the user's own asterisks. Matching
 * `**…**` on that escaped string can therefore only wrap already-inert text in
 * the `<strong>`/`</strong>` we insert — the sole real tags in the output. No
 * input can mint a live tag.
 *
 * `$1` substitutes the captured group as DATA (`String.replace` interprets `$`
 * only in the literal template, never in the captured text), so a `$`/`&` inside
 * the emphasised run is harmless. The `g` flag converts every pair; the
 * non-greedy `.+?` keeps `**a** and **b**` as two runs rather than one. A lone
 * unmatched `**` has no closing pair, so it stays literal.
 *
 * NOTE: callers must pass the RAW field (with the `**` literals intact). The
 * markup is presentation-only — the `**` stays in `CredentialContent`, so the
 * canonical signing payload is unaffected.
 */
export function escapeHtmlWithEmphasis(value: string): string {
  return escapeHtml(value).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

/** Format an ISO-8601 `YYYY-MM-DD` as e.g. `04 June 2026`.
 *
 * Deliberately string-split, NOT `new Date(iso)`: the Date constructor parses a
 * bare date as UTC midnight, which renders the previous day on a UTC-negative
 * host. Splitting the literal keeps the displayed date exactly as authored.
 */
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export function formatIsoDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso; // fall back to the raw value rather than throwing on display
  const [, year, month, day] = match;
  const monthName = MONTHS[Number(month) - 1] ?? month;
  return `${day} ${monthName} ${year}`;
}
