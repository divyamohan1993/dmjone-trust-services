/**
 * §1 (inline marks) + §2 (alignment directive) of the body rich-text contract.
 *
 * Pins EVERY §1.6 normative vector byte-for-byte (these are the cross-agent
 * reference) and asserts the §1.4 `wellFormed()` invariant on each — the
 * emitted tags balance and never overlap. Also pins the agent-choice
 * determinism vectors (crossing/leftover/≥4-star) to their exact deterministic
 * outputs, and the §2 alignment cases (default justify, strip-exactly-one, the
 * literal-`[[align:…]]` collision).
 */

import { describe, it, expect } from 'vitest';
import { compileInline, compileParagraph, escapeHtmlWithEmphasis, escapeHtml } from '../src/html.js';
import { wellFormed, checkWellFormed } from './well-formed.js';

/** Assert exact output AND well-formedness in one go (the binding §1.4 pair). */
function pin(input: string, expected: string): void {
  const out = compileInline(input);
  expect(out, `compileInline(${JSON.stringify(input)})`).toBe(expected);
  const wf = checkWellFormed(out);
  expect(wf.ok, `wellFormed(${JSON.stringify(out)}) — ${wf.reason ?? ''}`).toBe(true);
}

describe('compileInline — §1.6 normative vectors (escaped-input contract)', () => {
  // These run on ALREADY-ESCAPED text; none of the vector inputs contain
  // `& < > " '`, so the raw string is its own escaped form — except the script
  // safety vector, which is asserted via escapeHtmlWithEmphasis below.

  it('**bold** → <strong>bold</strong> (legacy; unchanged)', () => {
    pin('**bold**', '<strong>bold</strong>');
  });

  it('*it* → <em>it</em>', () => {
    pin('*it*', '<em>it</em>');
  });

  it('__u__ → <u>u</u>', () => {
    pin('__u__', '<u>u</u>');
  });

  it('***bi*** → <strong><em>bi</em></strong> (fixed strong-outer nesting)', () => {
    pin('***bi***', '<strong><em>bi</em></strong>');
  });

  it('__**x**__ → <u><strong>x</strong></u> (cross-kind nesting, no crossing)', () => {
    pin('__**x**__', '<u><strong>x</strong></u>');
  });

  it('**a** as **b** → two separate <strong> runs (legacy; preserved)', () => {
    pin('**a** as **b**', '<strong>a</strong> as <strong>b</strong>');
  });

  it('a **lonely marker → literal ** (no closing pair; legacy; preserved)', () => {
    pin('a **lonely marker', 'a **lonely marker');
  });

  it('a *lonely → literal *', () => {
    pin('a *lonely', 'a *lonely');
  });

  it('a __lonely → literal __', () => {
    pin('a __lonely', 'a __lonely');
  });

  it('file_name and a_b → single _ stays literal (no <u>)', () => {
    pin('file_name and a_b', 'file_name and a_b');
  });

  it('2 * 3 = 6 → space-flanked single * is literal', () => {
    pin('2 * 3 = 6', '2 * 3 = 6');
  });

  it('x ** y ** z → space-flanked ** is literal (intentional divergence §1.6)', () => {
    // Today's regex bolded this; the new parser renders it literal because each
    // ** has a space on its inner side. Documented as intentional so it is never
    // "fixed" back. The corpus contains none and the editor emits tight ** only.
    pin('x ** y ** z', 'x ** y ** z');
  });

  it('**Tom & Jerry** → entities inside an emphasised run ride through (legacy)', () => {
    // Pre-escaped form of the corpus string `**Tom & Jerry**`.
    pin('**Tom &amp; Jerry**', '<strong>Tom &amp; Jerry</strong>');
  });
});

describe('compileInline — §1.4 crossing + agent-pinned determinism vectors', () => {
  it('__a **b__ c** → <u>a **b</u> c** (crossed ** opener becomes literal)', () => {
    // THE fixed reference for the crossing rule (§1.4). The `**` opener lies
    // inside the `__…__` span as it would have crossed the close, so it reverts
    // to literal text in position; the trailing `**` finds no partner → literal.
    pin('__a **b__ c**', '<u>a **b</u> c**');
  });

  it('**a *b** c* → *<em>a <em>b</em>* c</em> (well-formed em-in-em, no overlap)', () => {
    // Impl-dependent but deterministic; the binding requirement is valid,
    // non-overlapping HTML with unbalanced markers literal. Pinned to the
    // actual deterministic output of the stack parser.
    pin('**a *b** c*', '*<em>a <em>b</em>* c</em>');
  });

  it('***x** → *<strong>x</strong> (3-run opener: 2 matched, 1 leftover literal)', () => {
    pin('***x**', '*<strong>x</strong>');
  });

  it('**x*** → <strong>x</strong>* (closer 3-run: 2 matched, 1 leftover literal)', () => {
    pin('**x***', '<strong>x</strong>*');
  });

  it('****x**** → *<strong><em>x</em></strong>* (min(3,4) each end, 1 leftover literal)', () => {
    pin('****x****', '*<strong><em>x</em></strong>*');
  });

  it('*a **b** c* → <em>a <strong>b</strong> c</em> (legit nesting; separate runs)', () => {
    // Sanity lock for "one match per run" not breaking real nested emphasis.
    pin('*a **b** c*', '<em>a <strong>b</strong> c</em>');
  });
});

describe('compileInline — underline is __ only (§1.1/§1.2)', () => {
  it('a _ run of length != 2 is fully literal', () => {
    pin('___lit___', '___lit___'); // triple underscore: literal both ends
    pin('____x____', '____x____'); // quad underscore: literal
    pin('a_b_c', 'a_b_c'); // single underscores: literal
  });

  it('two separate __word__ runs each become <u>', () => {
    pin('__a__ and __b__', '<u>a</u> and <u>b</u>');
  });

  it('__**x**__ keeps strong INSIDE u (cross-kind nest), never overlapping', () => {
    const out = compileInline('__**x**__');
    expect(out).toBe('<u><strong>x</strong></u>');
    expect(wellFormed(out)).toBe(true);
  });
});

describe('compileInline — safety (§1.5: only the six tags can ever appear)', () => {
  it('keeps injected markup inside ** inert (escaped input rides through)', () => {
    // Input is the escaped form of `**<script>x</script>**`.
    const out = compileInline('**&lt;script&gt;x&lt;/script&gt;**');
    expect(out).toBe('<strong>&lt;script&gt;x&lt;/script&gt;</strong>');
    expect(out).not.toContain('<script>');
    expect(wellFormed(out)).toBe(true);
  });

  it('a user-typed (escaped) <strong> never becomes a live tag', () => {
    const out = compileInline('&lt;strong&gt;x&lt;/strong&gt;');
    expect(out).toBe('&lt;strong&gt;x&lt;/strong&gt;');
    expect(out).not.toContain('<strong>');
    expect(wellFormed(out)).toBe(true);
  });

  it('emits no tag for delimiter-free text', () => {
    const s = 'has completed the internship with dmj.one &amp; peers';
    expect(compileInline(s)).toBe(s);
  });
});

describe('escapeHtmlWithEmphasis — legacy entrypoint, escape-first then compile', () => {
  it('is exactly compileInline(escapeHtml(value))', () => {
    const samples = [
      '**Acme**',
      '**<script>alert(1)</script>**',
      'plain <strong>x</strong> text',
      '**Tom & Jerry**',
      'hire **Acme** as **Engineer**',
      'a **lonely marker',
      'has completed the internship with dmj.one & peers',
      '2 * 3 = 6',
    ];
    for (const s of samples) {
      expect(escapeHtmlWithEmphasis(s)).toBe(compileInline(escapeHtml(s)));
    }
  });

  it('the full §1.6 script-safety vector through the legacy entrypoint', () => {
    expect(escapeHtmlWithEmphasis('**<script>x</script>**')).toBe(
      '<strong>&lt;script&gt;x&lt;/script&gt;</strong>',
    );
  });
});

describe('compileParagraph — §2 alignment directive + escape-first ordering', () => {
  it('NO directive → default pa-justify (legacy pref-less; renders justified)', () => {
    expect(compileParagraph('plain body text')).toEqual({
      html: 'plain body text',
      alignClass: 'pa-justify',
    });
  });

  it('each explicit directive maps to its class and is stripped', () => {
    expect(compileParagraph('[[align:left]]X')).toEqual({ html: 'X', alignClass: 'pa-left' });
    expect(compileParagraph('[[align:center]]X')).toEqual({ html: 'X', alignClass: 'pa-center' });
    expect(compileParagraph('[[align:right]]X')).toEqual({ html: 'X', alignClass: 'pa-right' });
    expect(compileParagraph('[[align:justify]]X')).toEqual({ html: 'X', alignClass: 'pa-justify' });
  });

  it('strips EXACTLY ONE directive; literal [[align:…]] collision renders verbatim (§2.2)', () => {
    // Editor stored center + a literally-typed [[align:left]]. Strip only the
    // first; the second survives as text, brackets render verbatim. Align=center.
    expect(compileParagraph('[[align:center]][[align:left]]Hello')).toEqual({
      html: '[[align:left]]Hello',
      alignClass: 'pa-center',
    });
  });

  it('a non-matching near-miss is NOT a directive (literal + default justify)', () => {
    // Leading whitespace, uppercase value, and an unknown value all fail the
    // anchored case-sensitive regex, so nothing is stripped and the brackets
    // render as literal text under the default class.
    expect(compileParagraph(' [[align:left]]X')).toEqual({
      html: ' [[align:left]]X',
      alignClass: 'pa-justify',
    });
    expect(compileParagraph('[[align:LEFT]]X')).toEqual({
      html: '[[align:LEFT]]X',
      alignClass: 'pa-justify',
    });
    expect(compileParagraph('[[align:middle]]X')).toEqual({
      html: '[[align:middle]]X',
      alignClass: 'pa-justify',
    });
  });

  it('escapes the remainder FIRST, then compiles marks (order is the safety contract)', () => {
    const out = compileParagraph('[[align:center]]**<b>Z</b>** & done');
    expect(out.alignClass).toBe('pa-center');
    expect(out.html).toBe('<strong>&lt;b&gt;Z&lt;/b&gt;</strong> &amp; done');
    expect(out.html).not.toContain('<b>');
    expect(wellFormed(out.html)).toBe(true);
  });

  it('directive does not interfere with inline marks in the body', () => {
    expect(compileParagraph('[[align:right]]see **Acme** and *role*')).toEqual({
      html: 'see <strong>Acme</strong> and <em>role</em>',
      alignClass: 'pa-right',
    });
  });

  it('every alignClass is one of the four blessed literals', () => {
    const allowed = new Set(['pa-left', 'pa-center', 'pa-right', 'pa-justify']);
    for (const raw of ['x', '[[align:left]]x', '[[align:center]]x', '[[align:bogus]]x']) {
      expect(allowed.has(compileParagraph(raw).alignClass)).toBe(true);
    }
  });
});

describe('wellFormed() test helper — rejects overlap, accepts same-tag nesting', () => {
  it('accepts balanced, non-overlapping tags', () => {
    expect(wellFormed('<u><strong>x</strong></u>')).toBe(true);
    expect(wellFormed('<strong><em>x</em></strong>')).toBe(true);
    expect(wellFormed('plain text, no tags')).toBe(true);
  });

  it('accepts SAME-tag nesting (stack-based, not a per-tag flag)', () => {
    expect(wellFormed('<em><em>x</em></em>')).toBe(true);
  });

  it('REJECTS the exact overlap the §1.4 crossing rule forbids', () => {
    // This is what an unguarded String.replace parser would emit for `__a **b__ c**`.
    expect(wellFormed('<u>a <strong>b</u> c</strong>')).toBe(false);
  });

  it('rejects an unclosed tag and a disallowed tag', () => {
    expect(wellFormed('<strong>x')).toBe(false);
    expect(wellFormed('<script>x</script>')).toBe(false);
    expect(wellFormed('<b>x</b>')).toBe(false);
  });
});
