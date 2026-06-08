# FROZEN CONTRACT — Certificate BODY Rich-Text (Bold / Italic / Underline + per-paragraph alignment + live-render + exact preview)

Status: **FROZEN** (finalized 2026-06-07, incorporating an adversarial design review).
Three implementation agents build against this **without coordinating**. Anything not written here is out of scope; do not invent additional marks, directives, endpoints, or schema fields. Where a value is given (regex, class name, CSS number, function signature, test vector), it is **normative and exact** — reproduce it byte-for-byte. When a rule and a test vector appear to conflict, the **test vector wins** and you must fix the implementation, never the vector.

---

## 0. Scope, invariants, ownership

### 0.1 What is being added
- Inline marks inside each body paragraph: **bold** (`<strong>`), *italic* (`<em>`), underline (`<u>`), and bold+italic (`<strong><em>…</em></strong>`).
- Per-paragraph horizontal alignment: Left / Center / Right / Justify, encoded as a leading directive token inside the stored paragraph string.
- A live "type-inside-the-render" editing surface in the admin issue form, plus an exact **Preview** button that renders the true Chromium PDF in an embedded viewer.

### 0.2 Hard invariants (NON-NEGOTIABLE)
1. **No shared change.** `packages/shared` (`schemas.ts`, `canonical.ts`, `types.ts`, `constants.ts`, `contracts.ts`) is untouched. `bodyParagraphs` stays `string[]`; `issueCredentialSchema.bodyParagraphs` stays `z.array(z.string().trim().min(1).max(1200)).min(1).max(6)`; the canonical payload keeps signing `bodyParagraphs` (raw strings, markup + directive included) AND `pdfSha256`. Presentation is **in-band markup inside the signed string** — exactly the blessed `**bold**` pattern, extended.
2. **Escape-FIRST safety, preserved for every new mark.** `escapeHtml` runs FIRST. Only after the text is fully inert (every `& < > " '` already an entity) are marks applied, and the ONLY live tags the compiler may emit are the six it inserts itself: `<strong> </strong> <em> </em> <u> </u>`. No input byte can mint any other live tag. (Proof in §1.5.)
3. **Strict-superset backward compatibility (CORRECTED scope).** Every string whose emphasis is only **tight `**word**` runs** (each `**` immediately adjacent to a non-whitespace character on its inner side), with **no** single `*`, **no** `__`, **no** `***`, and **no** leading alignment directive, compiles **byte-identically** to today's `escapeHtml(value).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')`. This is the entire current corpus (verified: all fixtures/tests use only tight `**word**`; none use single `*`, `_`, `__`, or `***`). **Spaced `**` is an intentional, pinned divergence** (see §1.6 vector `x ** y ** z`): the new parser renders it literal, today's regex bolded it. This is accepted because (a) the corpus contains none, and (b) the editor only ever emits tight delimiters.
4. **Default alignment = JUSTIFY.** A paragraph with NO leading directive renders justified — today's behavior (`.body{text-align:justify}`).
5. **CSP respected; ONE reviewed amendment.** The REAL issuer CSP (`services/issuer/src/http/middleware.ts:65-76`) is, verbatim:
   `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'nonce-…'; style-src 'self' 'nonce-…'; img-src 'self' data:; connect-src 'self'; font-src 'self'` — plus `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`.
   Therefore: **no inline `style="…"` attributes anywhere**, no `execCommand` paths that emit `style`/`align`/`color`/`<font>` attributes, no external origins. Alignment is expressed only via the four `pa-*` CSS classes (§2.4). **The single permitted amendment** (applied by the integrator, see §5.4): add `frame-src 'self' blob:` so the embedded preview iframe can load a same-origin `blob:` PDF. `X-Frame-Options: DENY` is unchanged and does NOT block a client-created `blob:` frame (a blob has no XFO header); the gating directive is `frame-src`. Nothing else in the CSP changes.
6. **Determinism.** Compilation is a pure function of the input string. No `Date`, no randomness, no locale. Same input ⇒ same HTML everywhere.

### 0.3 Ownership map (disjoint files — agents must not touch another's files)
- **Agent R — render package (`packages/render`).** Owns `packages/render/src/html.ts` (the tokenizer/parser + `compileParagraph`/`compileInline`; re-express `escapeHtmlWithEmphasis` as a thin wrapper, behavior-identical), `packages/render/src/template.ts` (body loop + `.body`/`pa-*`/`em`/`u` CSS), `packages/render/src/index.ts` (export the new symbols), and ALL files under `packages/render/test/`. Must NOT edit anything under `services/` or `packages/shared/`. Must NOT change the public API shape consumers rely on (`buildCertificateHtml(CertificateTemplateInput)`, `renderer.render`, and the existing exported names all stay).
- **Agent E — editor + viewer (`services/issuer/src/ui/*`, `routes/admin-ui.ts`).** Owns `services/issuer/src/routes/admin-ui.ts` (form markup), `services/issuer/src/ui/admin-script.ts` (the nonce'd IIFE), `services/issuer/src/ui/layout.ts` (nonce'd CSS) and/or a NEW `services/issuer/src/ui/*` module, and `services/issuer/test/admin-ui.test.ts`. Must keep the WebAuthn IIFE behaviorally intact. Must NOT edit `credentials.ts`, `issuance/*`, `middleware.ts`, or anything under `packages/`. (The `frame-src` CSP amendment + its header test are applied by the INTEGRATOR, not Agent E — Agent E builds the iframe viewer assuming `blob:` framing is permitted; jsdom does not enforce CSP, so its unit tests pass regardless.)
- **Agent P — preview API (`services/issuer/src/routes/credentials.ts`, `issuance`).** Owns `services/issuer/src/routes/credentials.ts` (add `POST /preview`), a NEW `services/issuer/src/issuance/assemble-content.ts`, the refactor of `services/issuer/src/issuance/issue.ts` to call it, and issuer tests for issuance/preview (`services/issuer/test/issuance.test.ts` + a new preview test). Must NOT edit `ui/*`, `admin-ui.ts`, `app.ts`, `deps.ts`, `middleware.ts`, or anything under `packages/`.

Shared seams every agent codes to (and ONLY to): inline grammar (§1), alignment grammar + four class names (§2), `compileParagraph` signature (§3), live-editor typography + editor↔store contract (§4), preview request/response + `assembleContent` signature + viewer mechanism (§5).

---

## 1. INLINE MARKS

### 1.1 Delimiters (exact)
| Mark | Delimiter | Output tag | Example |
| --- | --- | --- | --- |
| Bold | `**` | `<strong>…</strong>` | `**Acme**` → `<strong>Acme</strong>` |
| Italic | `*` | `<em>…</em>` | `*role*` → `<em>role</em>` |
| Bold+Italic | `***` | `<strong><em>…</em></strong>` | `***x***` → `<strong><em>x</em></strong>` |
| Underline | `__` | `<u>…</u>` | `__name__` → `<u>name</u>` |

- **Underline is `__` (doubled underscore), never single `_`.** Single `_` is ALWAYS literal text (occurs constantly in prose/identifiers/emails; doubling removes false positives and mirrors `**`). A `_` run of length ≠ 2 is literal.
- `***…***` emits the fixed nesting order `<strong><em>…</em></strong>` (strong outer, em inner) for determinism.
- Nesting across kinds is allowed when it does NOT cross (see §1.4): `__**x**__` → `<u><strong>x</strong></u>`.

### 1.2 Delimiter-run + flanking rules
- Scan a **maximal run** of consecutive identical delimiter chars as one unit. For `*`, the run length selects intent: 1 → italic, 2 → bold, 3 → bold+italic. A `*` run of length ≥4 contributes **at most `min(3, n)`** chars to a single delimiter at each end; leftover chars are **literal** and are NOT reused as a second delimiter. For `_`, only a run of exactly 2 is a delimiter; all other `_` runs are literal.
- **Flanking (CommonMark-simplified):** a run is **open-capable** iff the character immediately AFTER it exists and is NOT ASCII whitespace; **close-capable** iff the character immediately BEFORE it exists and is NOT ASCII whitespace. This is what keeps `x ** y ** z` literal (the inner side of each `**` is a space) and `2 * 3` literal. The editor always emits tight delimiters, so editor output is unaffected.
- A run with no matching partner stays **literal** (preserves today's "lone `**` stays literal").

### 1.3 MANDATED implementation — real tokenizer + delimiter-stack parser (NOT regex `.replace` chains)
A `String.replace` chain mis-nests overlapping/interleaved marks and cannot reliably degrade unbalanced markers to literals. Each compiler MUST implement a two-phase tokenizer/parser over the **already-escaped** string:

**Phase A — tokenize** into a flat list:
- `TEXT(value)` — maximal run of chars that are neither `*` nor `_`; emitted verbatim.
- `STAR(n)` — maximal run of `n` `*`.
- `USCORE(n)` — maximal run of `n` `_` (only `n===2` can be a delimiter).
Precompute `canOpen`/`canClose` per run from the adjacent characters (§1.2).

**Phase B — parse** with an explicit delimiter stack ("nearest matching opener"):
- Walk left→right. Push each open-capable run.
- On a close-capable run, search the stack top-down for the nearest opener of the SAME kind (`star`/`uscore`):
  - `star` length ≥3 matching opener ≥3 → `<strong><em>…</em></strong>`, consume 3 each.
  - else match 2 → `<strong>…</strong>`, consume 2 each.
  - else match 1 → `<em>…</em>`, consume 1 each.
  - `uscore` match 2 → `<u>…</u>`, consume 2 each.
  - Leftover delimiter chars after a partial match remain literal.
- Any run still unmatched at end → **literal** (its raw `*`/`_`). This is the "unbalanced ⇒ literal, never a broken tag" guarantee.
- Output = concatenation of `TEXT` values and emitted tag pairs. Hand-written (~80–150 lines). **Do NOT pull in a Markdown library** — the grammar is closed and must be auditable.

### 1.4 The CROSSING rule (MANDATORY — this is what prevents overlapping tags)
When a close-capable run searches for its nearest same-kind opener, **if an UNMATCHED open-capable run of a DIFFERENT kind lies between them, that intervening different-kind opener is rendered as literal text and removed from the stack BEFORE the match; a match that would cross an unmatched different-kind opener is forbidden.** (This is CommonMark's anti-crossing constraint / `openers_bottom`.) Without it, `__a **b__ c**` produces the overlapping `<u>a <strong>b</u> c</strong>` — forbidden. With it, the crossed `**` opener becomes literal.

Every compiled paragraph MUST satisfy a `wellFormed()` invariant: the emitted tag stack balances and no two tag ranges overlap. Agent R adds a `wellFormed()` test helper and asserts it on every §1.6 vector.

### 1.5 Safety proof (restated; holds for every mark)
1. `escapeHtml(raw)` turns every `& < > " '` into an entity. The only structural characters left for the tokenizer are the user's own `*`/`_`.
2. The tokenizer scans only for `*`/`_`; entities (`&lt;` etc.) ride inside `TEXT` untouched.
3. The only substrings the compiler INSERTS are the six literal tag strings; it inserts no attributes and nothing else.
4. ∴ the only `<…>` in the output are the six compiler-minted tags around inert text. No user byte can mint any other tag/attribute/`javascript:`/`on*` sink. A literal `<strong>` typed by the user becomes `&lt;strong&gt;` (escaped in step 1; `TEXT` to the tokenizer).
5. Content is concatenated as DATA (no `$`-template interpolation), so `$`/`&` inside an emphasized run are inert (preserves `**Tom & Jerry**` → `<strong>Tom &amp; Jerry</strong>`).

### 1.6 Normative inline test vectors (Agent R pins ALL of these; they are the cross-agent reference)
- `**bold**` → `<strong>bold</strong>` (legacy; unchanged)
- `*it*` → `<em>it</em>`
- `__u__` → `<u>u</u>`
- `***bi***` → `<strong><em>bi</em></strong>`
- `__**x**__` → `<u><strong>x</strong></u>`
- `**a** as **b**` → `<strong>a</strong> as <strong>b</strong>` (legacy; preserved)
- `a **lonely marker` → `a **lonely marker` (lone `**` literal; legacy; preserved)
- `a *lonely` → `a *lonely`
- `a __lonely` → `a __lonely`
- `file_name and a_b` → `file_name and a_b` (single `_` literal; no `<u>`)
- `2 * 3 = 6` → `2 * 3 = 6` (space-flanked single `*` literal)
- `x ** y ** z` → `x ** y ** z` (**intentional divergence** from legacy: space-flanked `**` is literal; document as intentional so no agent "fixes" it back)
- `**<script>x</script>**` → `<strong>&lt;script&gt;x&lt;/script&gt;</strong>` (safety; legacy; preserved)
- `**Tom & Jerry**` → `<strong>Tom &amp; Jerry</strong>` (legacy; preserved)
- `__a **b__ c**` → MUST be well-formed, no overlap; the crossed `**` opener is literal (crossing rule §1.4). Agent R pins the exact deterministic output and it becomes the reference.
- `**a *b** c*` , `***x**` , `**x***` , `****x****` → Agent R pins exact deterministic, well-formed outputs (no overlap; leftover delimiters literal per §1.2). These exist to lock cross-agent determinism; the binding requirement is **valid HTML, no broken/overlapping tags, unbalanced markers literal.**

---

## 2. ALIGNMENT (per-paragraph leading directive)

### 2.1 Directive syntax (exact)
Optional leading token at the very start of the stored string: `[[align:left]]`, `[[align:center]]`, `[[align:right]]`, `[[align:justify]]`.
Detect+strip regex (anchored at start, case-sensitive, no leading whitespace): `/^\[\[align:(left|center|right|justify)\]\]/`.
The token uses only `[ ] : a–z` — none are inline delimiters and none are rewritten by `escapeHtml`, so the directive cannot interact with the inline grammar or escaping.

### 2.2 Collision rule (user literally types `[[align:…]]` as body text)
- **The editor ALWAYS emits exactly one leading directive per paragraph** (including Justify → `[[align:justify]]`).
- **The compiler strips EXACTLY ONE leading directive**, then compiles the remainder.
- If the user literally typed `[[align:left]]Hello` in a centered paragraph, the editor stores `"[[align:center]][[align:left]]Hello"`; the compiler strips only the first (`center`), leaving `"[[align:left]]Hello"` which compiles to literal text (brackets render verbatim). Alignment = `center`. No double-strip, no ambiguity.
- **Legacy / pref-less strings** (no leading directive — every pre-feature credential): strip nothing, apply default class `pa-justify` (§2.4). Reproduces today's justified rendering exactly.

### 2.3 Canonical-signing consequence (understood, not changed)
The directive lives INSIDE the signed `bodyParagraphs` strings, so alignment is part of the signed/verifiable content (same as `**bold**` already is). Intended; no canonical change.

### 2.4 The four CSS classes (shared by `template.ts` AND the live editor — exact)
| Alignment | Class | CSS |
| --- | --- | --- |
| Left | `pa-left` | `text-align:left;` |
| Center | `pa-center` | `text-align:center;` |
| Right | `pa-right` | `text-align:right;` |
| Justify | `pa-justify` | `text-align:justify;text-justify:inter-word;` |

`pa-` prefix is collision-free (existing body uses `.body`, `.body p`, `.wish`). Add these four rules to BOTH `CERTIFICATE_CSS` in `packages/render/src/template.ts` AND the live-editor stylesheet. `.body` keeps `text-align:justify` as the inherited default so `pa-justify` and legacy pref-less paragraphs render identically to today.

---

## 3. COMPILER API (`packages/render/src/html.ts`)

### 3.1 New exports (exact signatures)
```ts
/** The four blessed paragraph-alignment classes. */
export type AlignClass = 'pa-left' | 'pa-center' | 'pa-right' | 'pa-justify';

/**
 * Compile ONE stored body-paragraph string into safe display HTML + its class.
 * Order (the safety contract):
 *   1. Strip exactly one leading alignment directive (§2.1/§2.2); default 'pa-justify'.
 *   2. escapeHtml() the remainder FIRST (text becomes inert).
 *   3. Run the inline tokenizer/parser (§1.3-1.4) over the inert text, emitting
 *      only <strong>/<em>/<u>; unbalanced/crossing markers degrade to literal.
 * Pure, deterministic, no I/O.
 */
export function compileParagraph(raw: string): { html: string; alignClass: AlignClass };

/**
 * Inline tokenizer/parser core (§1.3-1.4). Input MUST be ALREADY HTML-escaped
 * and have NO leading directive. Never calls escapeHtml itself. Exported for tests.
 */
export function compileInline(escapedText: string): string;
```
`escapeHtml` and `formatIsoDate` are unchanged and stay exported.

### 3.2 `escapeHtmlWithEmphasis` — keep exported, behavior-identical on the corpus
```ts
export function escapeHtmlWithEmphasis(value: string): string {
  return compileInline(escapeHtml(value)); // legacy entrypoint, no directive stripping
}
```
ALL existing assertions in `packages/render/test/html.test.ts` stay unchanged and green. If a legacy assertion would change, the tokenizer is wrong — fix the tokenizer, never the test. (Note: the legacy tight-`**word**` corpus is byte-identical; only the never-present spaced-`**` case diverges per §1.6.)

### 3.3 How `template.ts` uses it (exact)
```ts
// BEFORE
const bodyParas = content.bodyParagraphs.map((p) => `<p>${escapeHtmlWithEmphasis(p)}</p>`).join('');
// AFTER
const bodyParas = content.bodyParagraphs
  .map((p) => { const { html, alignClass } = compileParagraph(p); return `<p class="${alignClass}">${html}</p>`; })
  .join('');
```
- The `class` value is one of the four fixed literals — never user data — so the interpolation is safe.
- `.body{ max-width:152mm; margin:7mm auto 0; text-align:justify; text-justify:inter-word; }` stays as the container default; add the four `pa-*` rules to `CERTIFICATE_CSS`.
- Keep `.body p{font-family:var(--serif);font-size:11.5pt;line-height:1.62;color:var(--ink);margin-bottom:2.6mm;}` and `.body strong{font-weight:600;}`; add `.body em{font-style:italic;}` and `.body u{text-decoration:underline;}` (explicit; harmless).
- The optional `closingLine` `.wish` paragraph is UNCHANGED (plain `escapeHtml`, centered italic). Rich-text marks are NOT applied to the closing line (out of scope).

---

## 4. LIVE-EDITOR TYPOGRAPHY + editor↔store contract

### 4.1 Mirror the certificate body (exact values, sourced from `template.ts`/brand)
| Property | Value |
| --- | --- |
| font-family | `var(--serif)` = `"EB Garamond", Georgia, serif` |
| font-size | `11.5pt` |
| line-height | `1.62` |
| color (ink) | `#2B2A28` (`--ink`) |
| body column max-width | `152mm` |
| default text-align | `justify` (+ `text-justify:inter-word`) |
| paragraph spacing | `margin-bottom:2.6mm` |
| paper background (editor canvas) | `#FFFDFB` (`--paper`) |
| strong weight | `600` |

**Font source — reuse, do NOT re-embed.** The issuer already serves brand woff2 same-origin from `GET /fonts/:file` (`services/issuer/src/fonts/font-bytes.ts`), and `designSystemCss()` from `@dmjone/brand` (inlined by `page()` under the nonce) already declares the `@font-face` rules and the `--serif`/`--ink`/`--paper` variables. The editor reuses them by setting `font-family:var(--serif)` on the editing surface — it adds **no** new `@font-face` and fetches no new font. The PDF path (and therefore the exact Preview) still uses the render package's offline base64 `getFontFaceCss()` — unchanged.

Editor CSS ships via the existing nonce'd `<style>` (extend `ISSUER_CSS` in `layout.ts` or pass extra nonce'd CSS) — **never** inline `style=""` (CSP). The editing surface, toolbar buttons, and alignment controls use only classes.

### 4.2 "Type-inside-the-render" requirement
Replace the `#f-body` textarea with a faithful body-composing surface so the admin sees WHERE text lands: render, with certificate styling, a live read-only echo of the `intro` + `recipient` above and a signature/QR placeholder below, with the editable body column between them using §4.1 typography. The body updates live as the admin types/formats.

### 4.3 Editor mechanics (CSP-safe)
- Body = up to 6 paragraph blocks (schema `.max(6)`, min 1). Each block is `contenteditable`, default justify, with a per-paragraph alignment control (L/C/R/J) that toggles ONLY the `pa-*` class (never inline style; never `execCommand('justify*')`). Add/remove paragraph controls respect the 1–6 bound.
- A shared toolbar: **Bold / Italic / Underline** acting on the current selection. If `execCommand` is used, set `styleWithCSS=false` (emits `<b>/<i>/<u>` tags, not styles) and NORMALIZE in the serializer. Keyboard shortcuts Ctrl/Cmd+B/I/U.
- **PASTE** is intercepted and inserted as plain text (cleanliness; the serializer is the real boundary; inline handlers are already CSP-blocked).

### 4.4 The serializer (trust boundary — exact output contract)
On every change (and before preview/issue), serialize each paragraph block by walking its DOM, recognizing ONLY text nodes + `STRONG/B`, `EM/I`, `U`; map to the §1.1 delimiters; **flatten/unwrap everything else** (a pasted `<script>`/`<img onerror>`/`<b style>`/`<a href>` reduces to its text). Output `bodyParagraphs: string[]` where **each element is `"[[align:<x>]]" + inlineMarkup`** (the editor ALWAYS prepends the directive, §2.2). One visual paragraph = one element. Trim each element (the schema `.trim()` runs server-side for both issue and preview, so the editor MUST serialize trimmed strings so its live preview matches the render). Drop empty paragraphs (mirrors the existing `.filter(Boolean)`). The contenteditable HTML **never** leaves the browser — only the serialized string array does.

### 4.5 Preview button
A `data-action="preview"` button (event-delegated, no inline handler) serializes the form, POSTs the §5 preview request, receives a PDF blob, and shows it in the embedded viewer (§5.4). Surface loading/errors in the existing `#status` live region. Revoke the object URL on replace/close.

### 4.6 Accessibility (WCAG 2.2 AA — hard requirement)
- Toolbar `role="toolbar"` with arrow-key **roving tabindex**; B/I/U buttons carry `aria-pressed` reflecting the current selection's marks.
- Alignment controls labelled, with `aria-pressed` (or a labelled radiogroup).
- Each contenteditable has an accessible name (`aria-label`) and `aria-multiline="true"`.
- Visible focus; respect `prefers-reduced-motion`; keyboard B/I/U. Everything inside the existing nonce'd, dependency-free IIFE; no inline handlers.

---

## 5. PREVIEW API (exact, side-effect-free)

### 5.1 Endpoint
`POST /api/credentials/preview` — mounted inside `registerCredentialRoutes` (`api.post('/preview', …)` under the existing `api.use('*', requireAdmin(deps))`, so it is behind `requireAdmin`; unauthenticated ⇒ uniform 401 via the error funnel; **no `app.ts` change**).
- Request `content-type: application/json`. Validate INSIDE the route, no shared change:
  ```ts
  const previewSchema = issueCredentialSchema.omit({ password: true });
  ```
  Parse with `.safeParse`; on failure `throw new AppError(ERROR_CODE.VALIDATION_FAILED, 'Invalid preview request', 400, parsed.error.flatten())` (exactly like issue).
- Request shape: `{ type, recipientName, kicker, title, intro, bodyParagraphs: string[], closingLine?, issueDate }` — same field names/validation/limits as issue, minus `password`.
- Response: real rendered certificate **PDF bytes**, `Content-Type: application/pdf`, from `deps.renderer.render(content, { qrUrl })` (the genuine Chromium pipeline, identical to issuance step 2 → pixel-exact). Headers: `Content-Disposition: inline; filename="preview.pdf"`, `Cache-Control: no-store`. Return via Hono `c.body(pdfBytes)` with the content-type set.

### 5.2 Placeholders (NO allocation, NO signing, NO persistence)
Strictly side-effect-free. Build the SAME `CredentialContent` shape via `assembleContent` with placeholders:
- `credentialId`: fixed constant **`DMJ-PRV-00000000-00`** (satisfies `CREDENTIAL_ID_REGEX` = `/^DMJ-[A-Z]{2,4}-\d{8}-\d{2}$/`; `PRV` is 3 letters). Display-only; never stored.
- `qrUrl`: `` `${deps.env.VERIFY_PUBLIC_URL}/c/DMJ-PRV-00000000-00` `` (same construction as issuance, placeholder id).

The route MUST NOT call, in any form: `allocateCredentialId`, `deps.signer.sign`, `deps.section63.metadata`/`.generate`, `appendToLog`/`deps.logRepo`/`deps.logSigner`, `deps.passwordHasher.hash`, `deps.credentialRepo.create`/any write, `deps.blobStore.put`, `deps.anchorPublisher`/`deps.anchorRepo`, `deps.auditLog.append`. It performs exactly: validate → `assembleContent(input, 'DMJ-PRV-00000000-00')` → `deps.renderer.render(content, { qrUrl })` → return bytes. No DB read required.

### 5.3 `assembleContent` helper (factored out of `issue.ts`)
Create `services/issuer/src/issuance/assemble-content.ts`:
```ts
import { DEFAULT_SIGNATORY } from '@dmjone/shared';
import type { CredentialContent } from '@dmjone/shared';

export type AssembleContentInput = {
  type: CredentialContent['type'];
  issueDate: string; kicker: string; title: string; intro: string;
  recipientName: string; bodyParagraphs: string[]; closingLine?: string;
};

/** The exact CredentialContent both issue and preview render. The ONLY difference
 *  is the credentialId argument (real allocated id vs the 'DMJ-PRV-…' placeholder). */
export function assembleContent(input: AssembleContentInput, credentialId: string): CredentialContent {
  return {
    credentialId,
    type: input.type, issueDate: input.issueDate, kicker: input.kicker,
    title: input.title, intro: input.intro, recipientName: input.recipientName,
    bodyParagraphs: input.bodyParagraphs,
    signatory: { ...DEFAULT_SIGNATORY },
    ...(input.closingLine !== undefined && { closingLine: input.closingLine }),
  };
}
```
Refactor `issue.ts` (current content block ~lines 59–70) to call `assembleContent(input, credentialId)` so issuance and preview construct **identical** `CredentialContent` (same field order/spread, same `exactOptionalPropertyTypes` handling of `closingLine`). The full pipeline (allocate→render→sign→log→persist→audit) is otherwise unchanged.

### 5.4 Embedded viewer + the ONE CSP amendment
The Preview button (Agent E) does `fetch('/api/credentials/preview', { method:'POST', credentials:'same-origin', headers:{'content-type':'application/json'}, body: JSON.stringify(payload) })`, reads the response as a `Blob`, and embeds it in an `<iframe>` whose `src` is a fresh `URL.createObjectURL(blob)` (`blob:` same-origin URL). Revoke the URL on replace/close. Do NOT use `<object>`/`<embed>` (`object-src 'none'`).
**INTEGRATOR action (not the agents):** add `frame-src 'self' blob:` to the issuer CSP array in `middleware.ts` and update `services/issuer/test/headers.test.ts` to assert it. This is the single reviewed security amendment; `X-Frame-Options: DENY` stays (it does not gate a client-created `blob:` frame). Zero-CSP-change fallback if rejected: open the PDF in a new top-level tab via `window.open(blobUrl,'_blank','noopener')`.

---

## 6. Acceptance checklist (binding; all must be GREEN)
1. `packages/shared` unchanged; workspace typecheck green.
2. Every pre-existing assertion in `packages/render/test/html.test.ts` + render template/renderer/integration tests passes unchanged.
3. New §1.6 vectors pass; tokenizer is a real stack parser with the §1.4 crossing rule; `wellFormed()` holds on every vector (no overlapping/broken tags).
4. A pref-less legacy `bodyParagraphs` string renders justified, byte-identical to today.
5. `compileParagraph` strips exactly one leading directive; the literal-`[[align:…]]` collision case renders the typed token verbatim while honoring the editor's directive.
6. `escapeHtmlWithEmphasis` still exported from `html.ts` + `index.ts`, behavior-identical on the legacy corpus.
7. `POST /api/credentials/preview` returns `application/pdf`, behind `requireAdmin`, and a unit test proves the preview path calls NONE of the §5.2 side effects.
8. `issue.ts` and the preview route both build `CredentialContent` via `assembleContent`; issuance ordering/behavior otherwise unchanged (issuance tests green).
9. No inline `style=""` anywhere; alignment via the four `pa-*` classes only.
10. Live editor uses `var(--serif)`/`11.5pt`/`1.62`/`#2B2A28`/`152mm`/default justify; reuses the already-served `/fonts/*` faces (no new `@font-face`); WCAG 2.2 AA (roving toolbar, aria-pressed, labelled contenteditable).
11. Embedded preview viewer renders the blob PDF in an iframe; integrator-applied `frame-src 'self' blob:` amendment present with its header test.
