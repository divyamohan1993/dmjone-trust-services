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
 * The four blessed paragraph-alignment classes. The compiler emits exactly one
 * of these as the `<p class="…">` value (never user data), so the interpolation
 * in the template is safe (§2.4 of the body rich-text contract).
 */
export type AlignClass = 'pa-left' | 'pa-center' | 'pa-right' | 'pa-justify';

/** Maps an `[[align:…]]` directive value to its CSS class. */
const ALIGN_CLASS: Readonly<Record<string, AlignClass>> = {
  left: 'pa-left',
  center: 'pa-center',
  right: 'pa-right',
  justify: 'pa-justify',
};

/**
 * Detect+strip the optional leading alignment directive (§2.1). Anchored at the
 * very start, case-sensitive, no leading whitespace; the token uses only
 * `[ ] : a–z`, none of which `escapeHtml` rewrites or the inline grammar treats
 * as a delimiter, so the directive cannot interact with escaping or emphasis.
 */
const ALIGN_DIRECTIVE = /^\[\[align:(left|center|right|justify)\]\]/;

// ---------------------------------------------------------------------------
// Inline tokenizer + delimiter-stack parser (§1.3-1.4).
//
// A `String.replace` chain mis-nests overlapping/interleaved marks and cannot
// reliably degrade unbalanced markers to literals, so the compiler is a real
// two-phase parser over the ALREADY-ESCAPED string:
//
//   Phase A — tokenize into TEXT / STAR(n) / USCORE(n) runs, precomputing the
//             CommonMark-simplified flanking flags (canOpen/canClose).
//   Phase B — walk left→right with an explicit delimiter stack ("nearest
//             matching opener"), honouring the §1.4 crossing rule so a match
//             never spans an unmatched different-kind opener. Output is built
//             as an ORDERED node list (each node owns its residual literal text
//             plus close-before / open-after tag buffers) and stringified at the
//             end, so a delimiter the crossing rule invalidates — or one that
//             never finds a partner — re-emits its raw `*`/`_` chars IN POSITION.
//
// Safety (§1.5): the input is already inert (every `& < > " '` is an entity),
// the scanner only ever looks at the user's own `*`/`_`, and the only `<…>` the
// compiler inserts are the six literal tag strings it mints itself. No input
// byte can mint any other tag/attribute.
// ---------------------------------------------------------------------------

type RunKind = 'star' | 'uscore';
type Tag = 'strong' | 'em' | 'u';

/**
 * One token in the ordered output list. A plain TEXT node carries verbatim
 * (already-escaped) text. A DELIM node carries the still-unconsumed `*`/`_`
 * chars of a delimiter run (`text`), which render literally if the run is never
 * matched, plus two tag buffers that wrap that text once it pairs:
 *   - `pre`  — close tags emitted BEFORE the literal chars (this run closed a span)
 *   - `post` — open tags emitted AFTER the literal chars (this run opened a span)
 * Matching mutates only these three fields, so a node's position never shifts;
 * there is no array-index bookkeeping and no risk of overlap from splicing.
 */
interface Node {
  /** `null` for a pure TEXT node; the delimiter kind for a DELIM node. */
  kind: RunKind | null;
  /** Remaining (unconsumed) literal characters of this node. */
  text: string;
  /** Close tags rendered before {@link text}. */
  pre: Tag[];
  /** Open tags rendered after {@link text}. */
  post: Tag[];
  /** DELIM only: chars still available to match (mutated as consumed). */
  remaining: number;
  canOpen: boolean;
  canClose: boolean;
}

const isAsciiWhitespace = (ch: string | undefined): boolean =>
  ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f' || ch === '\v';

/**
 * Inline tokenizer/parser core (§1.3-1.4). Input MUST be ALREADY HTML-escaped
 * and have NO leading directive. Never calls {@link escapeHtml} itself.
 * Exported for tests.
 */
export function compileInline(escapedText: string): string {
  const nodes: Node[] = [];
  // Stack of open-capable DELIM nodes awaiting a partner ("nearest matching
  // opener"). A node never leaves the `nodes` list, so an opener that is never
  // matched — or is invalidated by the §1.4 crossing rule — simply renders its
  // residual `text` literally once it is popped/abandoned.
  const stack: Node[] = [];

  const len = escapedText.length;
  let i = 0;
  while (i < len) {
    const ch = escapedText[i];

    if (ch === '*' || ch === '_') {
      // Phase A: scan a maximal run of this delimiter char.
      let j = i + 1;
      while (j < len && escapedText[j] === ch) j++;
      const runLen = j - i;
      const kind: RunKind = ch === '*' ? 'star' : 'uscore';
      const before = i > 0 ? escapedText[i - 1] : undefined;
      const after = j < len ? escapedText[j] : undefined;
      // Underline is `__` ONLY: a `_` run of any length other than exactly 2 is
      // always literal (§1.1/§1.2) — single `_` occurs constantly in prose,
      // identifiers and emails. Such a run is never delimiter-eligible, so it
      // can neither open nor close. (`*` runs of any length ≥1 are eligible.)
      const eligible = kind === 'star' || runLen === 2;
      // Flanking (CommonMark-simplified, §1.2): open-capable iff the char AFTER
      // the run is non-whitespace; close-capable iff the char BEFORE is.
      const canOpen = eligible && after !== undefined && !isAsciiWhitespace(after);
      const canClose = eligible && before !== undefined && !isAsciiWhitespace(before);

      const node: Node = {
        kind,
        text: ch.repeat(runLen),
        pre: [],
        post: [],
        remaining: runLen,
        canOpen,
        canClose,
      };
      nodes.push(node);

      // Close-FIRST, then push the leftover opener. This ordering is what makes
      // `__**x**__` → `<u><strong>x</strong></u>`: a both-capable run consumes
      // as a closer, then any remainder may open. A run that already matched as
      // a closer does NOT then open with its leftover: "leftover delimiter chars
      // after a partial match remain literal" (§1.3), so they are never reused.
      const matched = canClose ? closeRun(node, stack) : false;
      if (!matched && node.remaining > 0 && node.canOpen) stack.push(node);

      i = j;
      continue;
    }

    // Phase A: TEXT — maximal run of non-delimiter chars, emitted verbatim.
    let j = i + 1;
    while (j < len && escapedText[j] !== '*' && escapedText[j] !== '_') j++;
    nodes.push({
      kind: null,
      text: escapedText.slice(i, j),
      pre: [],
      post: [],
      remaining: 0,
      canOpen: false,
      canClose: false,
    });
    i = j;
  }

  return renderNodes(nodes);
}

/**
 * Resolve a close-capable DELIM node against the stack with a SINGLE match
 * attempt: find the nearest same-kind opener, apply the §1.4 crossing rule,
 * wrap the enclosed text in the matched tag, consume delimiter chars from both
 * ends, and pop the opener. Returns whether a match occurred.
 *
 * One match per run is deliberate: "leftover delimiter chars after a partial
 * match remain literal" and are NOT reused as a second delimiter (§1.2/§1.3).
 * Both the closer's and the opener's residual chars therefore stay literal in
 * their nodes' `text`, so e.g. `****x****` → `*<strong><em>x</em></strong>*`
 * (3 used at each end, 1 leftover `*` literal) rather than reusing the spare.
 */
function closeRun(closer: Node, stack: Node[]): boolean {
  // Nearest same-kind opener, searching the stack top-down.
  let pos = -1;
  for (let s = stack.length - 1; s >= 0; s--) {
    const candidate = stack[s];
    if (candidate !== undefined && candidate.kind === closer.kind) {
      pos = s;
      break;
    }
  }
  if (pos === -1) return false; // no partner — leftover chars stay literal in place

  // §1.4 CROSSING rule: any UNMATCHED opener of a DIFFERENT kind sitting ABOVE
  // (more recent than) the matched opener cannot be crossed. Drop those from
  // the stack BEFORE the match; their residual `text` is already in the node
  // list, so they revert to literal text exactly where they were typed. This
  // is what forbids the overlapping `<u>a <strong>b</u> c</strong>`.
  if (pos < stack.length - 1) {
    stack.splice(pos + 1, stack.length - (pos + 1));
  }

  const opener = stack[pos];
  if (opener === undefined) return false;

  // Choose how many chars this pairing consumes from each end (§1.2):
  //   star ≥3 on both → <strong><em>…</em></strong>, consume 3;
  //   star 2 / uscore (exactly 2) → <strong>…</strong> / <u>…</u>, consume 2;
  //   star 1 → <em>…</em>, consume 1.
  if (closer.kind === 'star' && closer.remaining >= 3 && opener.remaining >= 3) {
    // ***…*** — fixed nesting strong>em (strong outer, em inner) for determinism.
    wrap(opener, closer, 3, ['strong', 'em']);
  } else if (closer.kind === 'uscore') {
    // Underline is only ever a run of exactly 2 (§1.1/§1.2); both ends have 2.
    wrap(opener, closer, 2, ['u']);
  } else if (closer.remaining >= 2 && opener.remaining >= 2) {
    wrap(opener, closer, 2, ['strong']);
  } else {
    wrap(opener, closer, 1, ['em']);
  }

  // The opener has matched; it (and its leftover) plays no further part. Pop it
  // (and anything above it, already cleared by the crossing splice).
  const idx = stack.indexOf(opener);
  if (idx !== -1) stack.splice(idx, 1);
  return true;
}

/**
 * Pair `n` chars of an opener and closer into the given nested tags, listed
 * OUTERMOST-first (e.g. `['strong', 'em']` for `***…***`). Consumes `n` chars
 * from each end's residual literal `text`, records the open tags on the opener
 * and the matching close tags on the closer:
 *   - opener `post` renders after its text in array order, so the OPEN tags go
 *     in forward (outer→inner) order: `…<strong><em>` immediately before the
 *     enclosed text;
 *   - closer `pre` renders before its text in array order, so the CLOSE tags go
 *     in reverse (inner→outer) order: `</em></strong>…` immediately after it.
 * Each node matches at most once as opener and once as closer, so these buffers
 * never accumulate conflicting entries.
 */
function wrap(opener: Node, closer: Node, n: number, tags: Tag[]): void {
  opener.remaining -= n;
  closer.remaining -= n;
  opener.text = opener.text.slice(n);
  closer.text = closer.text.slice(n);
  for (const tag of tags) opener.post.push(tag); // outer→inner opens
  for (let k = tags.length - 1; k >= 0; k--) {
    const tag = tags[k];
    if (tag !== undefined) closer.pre.push(tag); // inner→outer closes
  }
}

/**
 * Concatenate the ordered node list into the final HTML string. Each node emits
 * its `pre` close tags, then its residual literal `text` (including the raw
 * `*`/`_` of any unmatched/invalidated delimiter), then its `post` open tags.
 * The only `<…>` in the output are the six compiler-minted tags.
 */
function renderNodes(nodes: Node[]): string {
  let out = '';
  for (const node of nodes) {
    for (const tag of node.pre) out += `</${tag}>`;
    out += node.text;
    for (const tag of node.post) out += `<${tag}>`;
  }
  return out;
}

/**
 * Compile ONE stored body-paragraph string into safe display HTML + its class.
 * Order (the safety contract):
 *   1. Strip exactly one leading alignment directive (§2.1/§2.2); default 'pa-justify'.
 *   2. {@link escapeHtml} the remainder FIRST (text becomes inert).
 *   3. Run the inline tokenizer/parser (§1.3-1.4) over the inert text, emitting
 *      only <strong>/<em>/<u>; unbalanced/crossing markers degrade to literal.
 * Pure, deterministic, no I/O.
 */
export function compileParagraph(raw: string): { html: string; alignClass: AlignClass } {
  // Strip EXACTLY ONE leading directive (single regex match, no loop); a
  // literally-typed second `[[align:…]]` survives as text and the editor's
  // directive still wins (§2.2). `match[1]` is one of the four captured
  // alternatives whenever the regex matches, so the lookup never misses; the
  // `?? 'pa-justify'` only satisfies `noUncheckedIndexedAccess`.
  const match = ALIGN_DIRECTIVE.exec(raw);
  const directive = match?.[1];
  const alignClass: AlignClass =
    directive !== undefined ? (ALIGN_CLASS[directive] ?? 'pa-justify') : 'pa-justify';
  const remainder = match ? raw.slice(match[0].length) : raw;
  const html = compileInline(escapeHtml(remainder));
  return { html, alignClass };
}

/**
 * Escape untrusted text, then compile the inline mini-markup for DISPLAY only.
 * Legacy entrypoint: no directive stripping (the directive grammar belongs to
 * stored body paragraphs, which go through {@link compileParagraph}). Behaviour
 * is identical to the historical escape-then-`**…**`-to-`<strong>` regex on the
 * entire current corpus — every string whose emphasis is only tight `**word**`
 * runs compiles byte-identically (§0.2.3). Spaced `**` is the one intentional,
 * pinned divergence (§1.6): the parser renders it literal.
 *
 * NOTE: callers must pass the RAW field (with the `**`/`*`/`__` literals
 * intact). The markup is presentation-only — the delimiters stay in
 * {@link CredentialContent}, so the canonical signing payload is unaffected.
 */
export function escapeHtmlWithEmphasis(value: string): string {
  return compileInline(escapeHtml(value));
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
