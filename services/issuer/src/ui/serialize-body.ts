/**
 * The body-editor TRUST BOUNDARY (frozen contract §4.4).
 *
 * The live "type-inside-the-render" editor lets an admin compose each body
 * paragraph as `contenteditable` HTML with bold / italic / underline marks and
 * a per-paragraph alignment class. That HTML must NEVER leave the browser — only
 * a sanitised string array does. This module is that sanitiser: given one
 * paragraph block's DOM root, it walks the tree recognising ONLY text nodes and
 * the three blessed inline elements (`STRONG`/`B`, `EM`/`I`, `U`) and maps them
 * to the render package's in-band markup tokens (§1.1: `**`, `*`, `__`).
 * Everything else — a pasted `<script>`, an `<img onerror>`, a `<b style>`, an
 * `<a href>`, the `<div>`/`<br>` a contenteditable injects on Enter — is
 * UNWRAPPED to its text content (attributes are simply never emitted, so every
 * script/style/handler sink vanishes). The output of one block is
 * `"[[align:<x>]]" + inlineMarkup` (§2.2 — the editor ALWAYS prepends exactly
 * one alignment directive); empty paragraphs are dropped (mirrors the existing
 * `.filter(Boolean)`).
 *
 * SINGLE SOURCE OF TRUTH. The browser runs the EXACT bytes tested here: the
 * nonce'd admin IIFE embeds `serializeBlock.toString()` + `serializeBody.toString()`
 * (server-side `.toString()`, so no `eval`, no `unsafe-eval` — CSP-clean) and
 * calls them with real DOM nodes, which satisfy {@link SNode} structurally.
 * Because of that embedding, the two functions are shipped TOGETHER and
 * `serializeBlock` MUST stay self-contained (it nests ALL its own helpers and
 * closes over NOTHING at module scope); `serializeBody` may reference
 * `serializeBlock` by name because both declarations are emitted into the same
 * IIFE scope. Do not add a module-scope helper or constant either function
 * relies on, or the shipped `.toString()` would reference an undefined name.
 *
 * Tight-delimiter invariant (§0.2.3 / §1.2): the render compiler treats
 * space-flanked or empty delimiters as LITERAL (`x ** y ** z` stays literal).
 * So a recognised mark whose inner text is empty after trimming emits NO
 * delimiters (no stray `****`), and surrounding whitespace is hoisted OUTSIDE
 * the delimiters (`<strong> x </strong>` → ` **x** `, never `** x **`) so the
 * tokens the editor emits are always tight and round-trip through the compiler.
 */

/**
 * The minimal structural slice of the DOM `Node` interface the serialiser
 * touches. A real browser `Node` satisfies this (so the shipped `.toString()`
 * works on live nodes), and tests build plain-object trees that satisfy it too —
 * no `jsdom`, no DOM lib in tsconfig. `nodeType` 1 = element, 3 = text;
 * `tagName` is UPPERCASE for elements (so `<b>` and `<strong>` both arrive as
 * `'B'`/`'STRONG'`); `textContent` is the node's text.
 */
export interface SNode {
  nodeType: number;
  tagName?: string;
  childNodes: ArrayLike<SNode>;
  textContent: string | null;
}

/** One paragraph block as the editor presents it to the serialiser. */
export interface BodyBlock {
  /** The block's `contenteditable` DOM root (its children are the inline content). */
  root: SNode;
  /** The block's chosen alignment key: 'left' | 'center' | 'right' | 'justify'. */
  align: string;
}

/**
 * Serialise ONE paragraph block's DOM subtree into safe in-band inline markup
 * (NO alignment directive — {@link serializeBody} prepends that). Pure; depends
 * only on the structural shape of `root`. Self-contained so a single
 * `.toString()` ships it to the browser intact.
 *
 * Returns the block's markup with surrounding whitespace preserved but NOT yet
 * trimmed; {@link serializeBody} trims before prepending the directive.
 */
export function serializeBlock(root: SNode): string {
  var ELEMENT_NODE = 1;
  var TEXT_NODE = 3;

  // The three blessed marks → their in-band delimiter (§1.1). Tag names arrive
  // UPPERCASE; both the semantic tag and the `execCommand` legacy tag map to the
  // same delimiter (the serialiser is the normalisation point, §4.3).
  function delimiterFor(tagName: string): string | null {
    if (tagName === 'STRONG' || tagName === 'B') return '**';
    if (tagName === 'EM' || tagName === 'I') return '*';
    if (tagName === 'U') return '__';
    return null;
  }

  // Concatenate the serialisation of a node's children in order.
  function serializeChildren(node: SNode): string {
    var out = '';
    var kids = node.childNodes;
    for (var i = 0; i < kids.length; i++) {
      out += serializeNode(kids[i] as SNode);
    }
    return out;
  }

  // Wrap an inner string in a mark's delimiters while keeping them TIGHT: drop
  // the mark entirely when the inner is whitespace-only (so no `****`/`** **`
  // leaks), and hoist any leading/trailing whitespace OUTSIDE the delimiters
  // (so `<strong> x </strong>` → ` **x** `, which the compiler bolds, not
  // `** x **`, which it would render literal).
  function wrapTight(inner: string, delim: string): string {
    var lead = inner.match(/^\s*/);
    var trail = inner.match(/\s*$/);
    var leading = lead ? lead[0] : '';
    var trailing = trail ? trail[0] : '';
    var core = inner.slice(leading.length, inner.length - trailing.length);
    if (core === '') return inner; // whitespace-only (or empty): emit no marks
    return leading + delim + core + delim + trailing;
  }

  function serializeNode(node: SNode): string {
    if (node.nodeType === TEXT_NODE) {
      // The literal characters the admin typed. NOT escaped here — the render
      // compiler runs escapeHtml() FIRST on the stored string (§1.5), so a user
      // who types `<` or `**` stores it verbatim and the compiler makes it inert
      // / interprets it per the inline grammar there.
      return node.textContent || '';
    }
    if (node.nodeType !== ELEMENT_NODE) return ''; // comments, etc. → nothing
    var inner = serializeChildren(node);
    var delim = delimiterFor(node.tagName || '');
    if (delim === null) return inner; // unknown element → unwrap (keep children)
    return wrapTight(inner, delim);
  }

  return serializeChildren(root);
}

/**
 * Serialise a list of paragraph block roots to the stored `bodyParagraphs:
 * string[]` (§4.4). Each non-empty element is `"[[align:<x>]]" + trimmedMarkup`;
 * the directive is ALWAYS prepended (including `justify`, §2.2). Blocks whose
 * markup is empty after trimming are dropped (mirrors `.filter(Boolean)`); a
 * directive-only string is never emitted. An all-empty editor yields `[]` (the
 * server schema's `.min(1)` then surfaces a uniform validation error).
 *
 * Ships alongside {@link serializeBlock} (which it calls by name) in the admin
 * IIFE; both `.toString()` bodies are emitted into the same scope.
 */
export function serializeBody(blocks: ArrayLike<BodyBlock>): string[] {
  // The four blessed alignment keys; anything else falls back to justify (the
  // certificate default, §2.1). Keeps the directive token always well-formed.
  function normalizeAlign(align: string): string {
    if (align === 'left' || align === 'center' || align === 'right' || align === 'justify') {
      return align;
    }
    return 'justify';
  }

  var out: string[] = [];
  for (var i = 0; i < blocks.length; i++) {
    var block = blocks[i] as BodyBlock;
    var markup = serializeBlock(block.root).trim();
    if (markup === '') continue; // drop empty paragraph; never emit directive-only
    out.push('[[align:' + normalizeAlign(block.align) + ']]' + markup);
  }
  return out;
}
