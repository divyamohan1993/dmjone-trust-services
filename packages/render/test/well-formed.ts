/**
 * Test helper: assert that compiled inline HTML is WELL-FORMED — every emitted
 * tag is one of the six the compiler is allowed to mint, the open/close tags
 * nest as a balanced stack, and NO two tag ranges overlap (the §1.4 invariant).
 *
 * This is deliberately a real stack parser, NOT a per-tag counter: a counter
 * would happily accept the overlap the crossing rule exists to forbid, e.g.
 * `<u>a <strong>b</u> c</strong>` (equal counts, but `</u>` closes while
 * `<strong>` is still open). Same-tag nesting (`<em><em>x</em></em>`) is valid
 * and must be accepted — push/pop on a stack handles it naturally.
 *
 * Entities (`&lt;`, `&amp;`, `&#39;`) carry no literal `<`, so they ride past
 * the scanner as text; the scanner only ever recognises the six tag tokens.
 */

const ALLOWED = new Set(['strong', 'em', 'u']);

/** A single emitted tag token: open/close + one of the six allowed names. */
const TAG = /<(\/?)(strong|em|u)>/g;

export interface WellFormedResult {
  ok: boolean;
  reason?: string;
}

/**
 * Returns `{ ok: true }` iff `html` contains only balanced, non-overlapping
 * `<strong>`/`<em>`/`<u>` tag pairs and no other live tag.
 */
export function checkWellFormed(html: string): WellFormedResult {
  // Reject any live tag that is NOT one of the six allowed ones. Every real
  // `<` that begins a tag would have survived escaping only if the compiler
  // minted it; a stray `<foo>` here means the compiler leaked markup.
  const anyTag = /<\/?[a-zA-Z][^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = anyTag.exec(html)) !== null) {
    const name = /^<\/?([a-zA-Z]+)/.exec(m[0])?.[1];
    if (name === undefined || !ALLOWED.has(name)) {
      return { ok: false, reason: `disallowed or malformed tag: ${m[0]}` };
    }
  }

  // Stack-balance the six allowed tags; reject overlap / unbalance.
  const stack: string[] = [];
  TAG.lastIndex = 0;
  let t: RegExpExecArray | null;
  while ((t = TAG.exec(html)) !== null) {
    const isClose = t[1] === '/';
    const tag = t[2];
    if (tag === undefined) return { ok: false, reason: `unparsable tag: ${t[0]}` };
    if (!isClose) {
      stack.push(tag);
    } else {
      const top = stack.pop();
      if (top !== tag) {
        return {
          ok: false,
          reason: `overlap/unbalance: </${tag}> closes while <${top ?? '∅'}> is open`,
        };
      }
    }
  }
  if (stack.length > 0) {
    return { ok: false, reason: `unclosed tag(s): ${stack.join(', ')}` };
  }
  return { ok: true };
}

/** Convenience boolean form for `expect(wellFormed(x)).toBe(true)`. */
export function wellFormed(html: string): boolean {
  return checkWellFormed(html).ok;
}
