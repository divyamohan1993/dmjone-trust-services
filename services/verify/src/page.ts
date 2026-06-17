/**
 * The public verify surface, staged as "The Examination Chamber": a midnight
 * cinematic theatre in which a real verification visibly happens. Three pages
 * share the stage (landing `/`, credential `/c/:id`, the branded 404), one
 * standalone dark stylesheet ({@link verifyCinemaCss}) and one cacheable client
 * engine (`/assets/cinema-<hash>.js`) drive them.
 *
 * The trust model is unchanged and load-bearing:
 *  - The verdict, the per-check ledger and every HR/legal field are rendered
 *    SERVER-SIDE from the authoritative outcome, so the page is correct and
 *    court-presentable with JavaScript off; the engine only re-paints states
 *    the server computed and paces them to the REAL live re-verification.
 *  - The struck gold seal is revealed ONLY by the client on a live VALID
 *    result (`.verdict.valid.sealed`); revoked/tampered/unknown and the
 *    upload file-gate never show gold. Scarcity is the trust signal.
 *  - Honest wording everywhere: a self-signed cryptographic attestation by an
 *    independent educational initiative; the conditional external-anchor
 *    sentence; the conditional RFC-3161 line; never a licensed-CA claim.
 *  - NO handwritten-signature image, NO direct certificate-PDF link; the
 *    gated PDF is obtainable only by POST with the private password.
 *  - Strict-CSP discipline: one nonce'd <style>, zero inline scripts (the
 *    engine loads same-origin via script-src 'self'), zero style=""/on*=
 *    attributes, zero url() images (inline SVG only; img-src stays 'none').
 *
 * The narrative below the fold is the THREE WORLDS a verification crosses:
 *   I.  The Signature  (the post-quantum lattice; ML-DSA-87 over the record)
 *   II. The Ledger     (the append-only transparency log + external anchor)
 *   III.The Clock      (the independent RFC-3161 timestamp, when present)
 * Each world states only what the server actually verified for THIS record.
 */

import { IDENTITY } from '@dmjone/brand';
import type {
  CredentialContent,
  CredentialRecord,
  LetterContent,
  UploadAttestation,
  VerificationChecks,
  VerificationOutcome,
} from '@dmjone/shared';
import { documentKind, titleCase } from '@dmjone/shared';
import { escapeHtml } from './escape.js';
import { verifyCinemaCss } from './page-css.js';
import { cinemaAssetPath } from './cinema.js';

/** Human label for each credential type code. */
const TYPE_LABEL: Record<string, string> = {
  internship: 'Internship',
  completion: 'Completion',
  appreciation: 'Appreciation',
  experience: 'Experience',
  participation: 'Participation',
};

/** "2026-06-04" → "04 June 2026" (stable, locale-independent). */
function formatIssueDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const year = m[1];
  const monthIdx = Number(m[2]) - 1;
  const day = m[3];
  const month = months[monthIdx] ?? m[2];
  return `${day} ${month} ${year}`;
}

/**
 * Turn a raw upload filename into a dignified document title for the hero: drop a
 * trailing extension, collapse separator runs (`.` `_` `-`) into single spaces,
 * squeeze whitespace. Original case is preserved on purpose; the document shows
 * as the uploader named it. The extension surfaces separately as a small chip.
 */
function displayDocName(filename: string): string {
  const noExt = filename.replace(/\.[A-Za-z0-9]{1,8}$/, '');
  const spaced = noExt.replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return spaced || 'Uploaded document';
}

/** A trailing file extension as a short uppercase tag (e.g. "PDF"), or '' if none. */
function fileExtTag(filename: string): string {
  const ext = /\.([A-Za-z0-9]{1,8})$/.exec(filename)?.[1];
  return ext ? ext.toUpperCase() : '';
}

/**
 * Show a hash as a short, masked fingerprint (head + tail), never 64 raw hex
 * chars. The server compares the FULL hash against its stored record, so the
 * on-screen value is human reassurance only, never the thing being checked.
 */
function maskHash(hex: string): string {
  return hex.length > 20 ? `${hex.slice(0, 10)}…${hex.slice(-6)}` : hex;
}

export interface CredentialPageInput {
  record: CredentialRecord;
  issuer: string;
  issuerLegalName: string;
  verifyBaseUrl: string;
  nonce: string;
  /** Server-computed verdict, so the no-JS badge is a real cryptographic result. */
  verification: { outcome: VerificationOutcome; checks: VerificationChecks };
  /**
   * Server-verified RFC-3161 trusted timestamp over the record's raw ML-DSA
   * signature bytes, if the record carries a token AND it verifies. Present ⇒
   * one honest, CONDITIONAL line (and the Clock world) is surfaced; absent or
   * unverified ⇒ nothing is claimed about WHEN.
   */
  trustedTimestamp?: { genTime?: string; tsaSubject?: string };
  /**
   * WS2: the record's unguessable verify token. When present (all new issuance),
   * the page routes its self-references — live verify, §63, evidence, file-gate —
   * through `/v/<token>` / by-token endpoints, so the document is NOT reachable by
   * its sequential id. Absent ⇒ a legacy record served by id.
   */
  verifyToken?: string;
}

/* ═══════════════════════ stage furniture (decorative) ═══════════════════════ */

/**
 * Film grain: a static inline-SVG turbulence layer (CSP-clean; no url() image,
 * no animation). Composited once by the GPU; reduced-motion safe by nature.
 */
function grainSvg(): string {
  return `  <svg class="grain" aria-hidden="true" focusable="false"><filter id="gn"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#gn)"/></svg>`;
}

/** One many-petalled rose ring of the guilloche lace (r = base + amp·cos kθ). */
function rosePath(base: number, amp: number, k: number, cx: number, cy: number): string {
  const steps = 360;
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    const r = base + amp * Math.cos(k * t);
    const x = cx + r * Math.cos(t);
    const y = cy + r * Math.sin(t);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return `M${pts.join('L')}Z`;
}

/**
 * The guilloche lace behind the verdict slot: dense, MANY-petalled wave rings
 * (14- and 22-petal rose curves), the engraved-lathe ornament of banknotes and
 * certificate borders. Deliberately high petal counts and static: lace reads
 * as security printing; low-point geometry or rotation could be misread as
 * star-sign iconography, which has no place on a trust surface. Drawn in
 * currentColor so the stylesheet recolours it per state. Purely decorative.
 */
const ROSETTE_SVG: string = (() => {
  const lace1 = rosePath(86, 7, 22, 100, 100);
  const lace2 = rosePath(70, 9, 14, 100, 100);
  const lace3 = rosePath(54, 5, 22, 100, 100);
  return `<svg class="rosette" viewBox="0 0 200 200" aria-hidden="true" focusable="false">`
    + `<circle cx="100" cy="100" r="97" fill="none" stroke="currentColor" stroke-width=".5" opacity=".55"/>`
    + `<circle cx="100" cy="100" r="92" fill="none" stroke="currentColor" stroke-width=".4" stroke-dasharray="1.5 2.5" opacity=".5"/>`
    + `<path d="${lace1}" fill="none" stroke="currentColor" stroke-width=".5" opacity=".75"/>`
    + `<path d="${lace2}" fill="none" stroke="currentColor" stroke-width=".45" opacity=".6"/>`
    + `<path d="${lace3}" fill="none" stroke="currentColor" stroke-width=".4" opacity=".5"/>`
    + `</svg>`;
})();

/** The fixed stage layers every page shares (canvas + vignette + grain + progress). */
function stageLayers(): string {
  return `  <canvas id="stage" class="stage" aria-hidden="true"></canvas>
  <div class="vignette" aria-hidden="true"></div>
${grainSvg()}
  <div class="progress" aria-hidden="true"></div>`;
}

/**
 * The struck gold SEAL: the focal jewel, an embossed medallion with a curved
 * notary legend (SVG textPath, same-origin fragment refs). Purely decorative
 * (`aria-hidden`): the human verdict is carried by the `.verdict .word`
 * sentence. Visibility + the stamp are gated by `.verdict.valid.sealed`,
 * added by the client ONLY on a live VALID result / confirmed file match.
 */
function seal(): string {
  return `          <div class="seal" aria-hidden="true">
            <span class="seal__flash"></span>
            <svg class="seal__ring" viewBox="0 0 100 100" focusable="false">
              <defs>
                <path id="seal-ring-top" d="M 50 50 m -39 0 a 39 39 0 1 1 78 0"></path>
                <path id="seal-ring-bot" d="M 50 50 m 39 0 a 39 39 0 1 1 -78 0"></path>
              </defs>
              <text><textPath href="#seal-ring-top" startOffset="50%" text-anchor="middle">dmj.one Trust Services</textPath></text>
              <text><textPath href="#seal-ring-bot" startOffset="50%" text-anchor="middle">&#183; Verified Record &#183;</textPath></text>
            </svg>
            <span class="seal__core">
              <span class="seal__star">&#10022;</span>
              <span class="seal__script">Verified</span>
            </span>
          </div>`;
}

/* ═══════════════════ verdict copy (Tier 1 + Tier 2, locked) ═══════════════════ */

/**
 * Tier 1: the plain-language verdict. A full human sentence a non-technical
 * recruiter reads in one second, scoped so it never overclaims a self-signed
 * attestation. The `.verdict` carries the outcome class server-side so it is
 * correct (and final) with JavaScript off.
 */
function verdictCopy(
  outcome: VerificationOutcome,
): { cls: string; word: string; sub: string; glyph: string } {
  switch (outcome) {
    case 'valid':
      return {
        cls: 'valid',
        word: 'Genuine.',
        sub: 'Issued by dmj.one Trust Services, and unaltered since.',
        glyph: '✓',
      };
    case 'revoked':
      // LEAD WITH THE WARNING: the eye must land on the withdrawal, not on
      // prestige; the glyph + word read as "do not rely" without colour.
      return {
        cls: 'revoked',
        word: 'Revoked.',
        sub: 'Issued by dmj.one, then withdrawn. Do not rely on it.',
        glyph: '⊘',
      };
    case 'tampered':
      return {
        cls: 'bad',
        word: 'Altered.',
        sub: 'This does not match what was signed. Do not rely on it.',
        glyph: '✕',
      };
    default:
      return {
        cls: 'unknown',
        word: 'Not confirmed.',
        sub: 'We could not confirm this. Check the ID or contact the issuer.',
        glyph: '—',
      };
  }
}

/** Map an outcome to its badge presentation (class + label + note). */
function outcomeBadge(
  outcome: VerificationOutcome,
  issuer: string,
): { cls: string; label: string; note: string } {
  switch (outcome) {
    // The LABEL is the lifecycle term the pill + checks ledger share; the NOTE
    // states the TECHNICAL fact and must NOT restate the human verdict word.
    case 'valid':
      return {
        cls: 'valid',
        label: 'VALID',
        note: `The post-quantum signature by ${issuer} verifies against this record, which is in the transparency log and not revoked.`,
      };
    case 'revoked':
      return {
        cls: 'revoked',
        label: 'REVOKED',
        note: `Issued by ${issuer}, then withdrawn by the issuer. It should not be relied upon.`,
      };
    case 'tampered':
      return {
        cls: 'bad',
        label: 'TAMPERED',
        note: 'The data shown does not match what was cryptographically signed.',
      };
    default:
      return {
        cls: 'unknown',
        label: 'UNKNOWN',
        note: `We could not confirm this against ${issuer}'s records. Check the ID, or contact the issuer.`,
      };
  }
}

/**
 * HERO HARD-FACT, valid only: the ONE compact line of EVIDENCE a non-scroller
 * sees. Names exactly the cryptographic guarantees a `valid` outcome PROVES;
 * anchorProof is informational and may be pending, so this deliberately never
 * claims "all N checks passed" (honesty lock, test-pinned). Returns '' on
 * every non-valid state.
 */
function heroHardFact(affirmative: boolean, ts: CredentialPageInput['trustedTimestamp']): string {
  if (!affirmative) return '';
  const day = (ts?.genTime ?? '').slice(0, 10);
  const stamped = /^\d{4}-\d{2}-\d{2}$/.test(day) ? ` · independently timestamped ${escapeHtml(formatIssueDate(day))}` : '';
  return `          <p class="hardfact" aria-label="What this proves">Post-quantum signature verified, recorded in the transparency log, not revoked${stamped}.</p>`;
}

/**
 * CERTIFICATE/LETTER COMPARISON line, valid only: a copied QR on a forged print
 * still loads THIS page showing the TRUE record, so the reader is asked to
 * compare the human-readable facts against the document in their hand. Not
 * shown on uploads (they have the byte-level file-gate) nor on bad states.
 */
function heroCompareLine(affirmative: boolean, kind: ReturnType<typeof documentKind>): string {
  if (!affirmative || kind === 'upload') return '';
  return `          <p class="compare">Confirm the name, date and details below match the document you&rsquo;re holding.</p>`;
}

/**
 * HONESTY line, every state: the one disclaimer that must never be buried under
 * confident seal language. dmj.one is an independent educational initiative,
 * not a government-licensed certifying authority.
 */
function heroHonestyLine(): string {
  return `          <p class="honesty">A cryptographic attestation by dmj.one, an independent educational initiative, not a government-licensed certifying authority.</p>
          <p class="honesty">We attest these are the exact bytes dmj.one issued; we do not independently audit the truth of the statements made in the document.</p>`;
}

/**
 * Upload (Mode 3) FILE-GATE copy. An id/QR scan alone cannot prove the file in
 * the holder's hand is the attested one (a copied code can sit on any file),
 * so a cryptographically-valid upload leads with a cautious, record-scoped
 * state; the affirmative verdict + seal are earned ONLY on a byte-for-byte
 * match via /api/verify/file.
 */
const UPLOAD_FILEGATE_VERDICT = {
  cls: 'unconfirmed',
  word: 'Confirm your copy.',
  sub: 'This document number carries a genuine dmj.one attestation. Scanning a code only proves the record exists, not which file you are holding. Drop your file here; only a byte-for-byte match proves it is the document we attested.',
  glyph: '?',
};

const UPLOAD_FILEGATE_BADGE = {
  cls: 'unconfirmed',
  label: 'FILE NOT YET CONFIRMED',
  note: 'The attestation record is genuine and intact. Confirm the file itself to prove your copy is the one we attested.',
};

/** CSS class for a single check given its boolean (anchor-pending is a soft warn). */
function checkClass(key: string, value: boolean | undefined): string {
  if (key === 'anchorProof' && value === false) return 'warn';
  if (value === true) return 'pass';
  if (value === false) return 'fail';
  return '';
}

/* ═══════════════════════ the kind-aware page face ═══════════════════════════ */

interface PageFace {
  /** <title> text (already plain; escaped by head()). */
  pageTitle: string;
  /** The hero identity block: eyebrow + headline + recipient/summary line. */
  hero: string;
  /** The <dt>/<dd> rows of the details grid, EXCLUDING the trailing status row. */
  detailRows: string;
}

function certificateFace(c: CredentialContent, issued: string, issuer: string, id: string): PageFace {
  const typeLabel = TYPE_LABEL[c.type] ?? titleCase(c.type);
  return {
    pageTitle: `${typeLabel} certificate · ${c.recipientName} · ${IDENTITY.trustService}`,
    hero: `        <p class="eyebrow">${escapeHtml(c.kicker)}</p>
        <h1 class="type-title" id="cred-title">${escapeHtml(c.title)}</h1>
        <p class="recipient"><span class="lbl">${escapeHtml(c.intro)}</span>${escapeHtml(c.recipientName)}</p>`,
    detailRows: `          <dt>Recipient</dt><dd>${escapeHtml(c.recipientName)}</dd>
          <dt>Credential</dt><dd>${escapeHtml(c.kicker)} ${escapeHtml(c.title)}</dd>
          <dt>Type</dt><dd>${escapeHtml(typeLabel)}</dd>
          <dt>Issue date</dt><dd>${escapeHtml(issued)}</dd>
          <dt>Issuer</dt><dd>${escapeHtml(issuer)}</dd>
          <dt>Credential ID</dt><dd><code class="mono">${escapeHtml(id)}</code></dd>`,
  };
}

function letterFace(c: LetterContent, issued: string, issuer: string, id: string): PageFace {
  // The headline is the subject if present, else the first recipient line, else
  // a neutral fallback; never the letter body (that lives in the gated PDF).
  const headline = (c.subject ?? c.recipientLines[0] ?? 'Letter').trim() || 'Letter';
  const addressee = (c.recipientLines[0] ?? '').trim();
  return {
    pageTitle: `Letter · ${headline} · ${IDENTITY.trustService}`,
    hero: `        <p class="eyebrow">Letterhead · Trusted Document</p>
        <h1 class="type-title" id="cred-title">Letter · ${escapeHtml(headline)}</h1>
        ${addressee ? `<p class="recipient"><span class="lbl">To</span>${escapeHtml(addressee)}</p>` : ''}`,
    detailRows: `${c.subject ? `          <dt>Subject</dt><dd>${escapeHtml(c.subject)}</dd>\n` : ''}${
      addressee ? `          <dt>Recipient</dt><dd>${escapeHtml(addressee)}</dd>\n` : ''
    }          <dt>Issue date</dt><dd>${escapeHtml(issued)}</dd>
          <dt>Issuer</dt><dd>${escapeHtml(issuer)}</dd>
          <dt>Document ID</dt><dd><code class="mono">${escapeHtml(id)}</code></dd>`,
  };
}

function uploadFace(c: UploadAttestation, issued: string, issuer: string, id: string): PageFace {
  const filename = (c.originalFilename || 'Uploaded document').trim() || 'Uploaded document';
  const docName = displayDocName(filename);
  const ext = fileExtTag(filename);
  return {
    pageTitle: `Attested document · ${filename} · ${IDENTITY.trustService}`,
    hero: `        <p class="eyebrow">Attested Document</p>
        <h1 class="type-title doc-name" id="cred-title">${escapeHtml(docName)}</h1>
        <p class="docmeta">${ext ? `<span class="filechip">${escapeHtml(ext)}</span>` : ''}<span class="docnum"><span class="k">Document no.</span> <code class="mono">${escapeHtml(id)}</code></span></p>`,
    detailRows: `          <dt>Document number</dt><dd><code class="mono">${escapeHtml(id)}</code></dd>
          <dt>File name</dt><dd>${escapeHtml(filename)}</dd>
          <dt>Original SHA-256</dt><dd><code class="mono">${escapeHtml(c.originalSha256)}</code></dd>
          <dt>Pages</dt><dd>${escapeHtml(String(c.pageCount))}</dd>
          <dt>Issue date</dt><dd>${escapeHtml(issued)}</dd>
          <dt>Issuer</dt><dd>${escapeHtml(issuer)}</dd>`,
  };
}

/** Honest, kind-specific copy for the shared trust statement's lead sentence. */
function trustLead(kind: ReturnType<typeof documentKind>, issuerLegalName: string): string {
  switch (kind) {
    case 'upload':
      return `<strong>${escapeHtml(issuerLegalName)}</strong> attests that it signed this document; the
        document's content is the uploader's, not authored or endorsed by dmj.one.`;
    case 'letter':
      return `<strong>${escapeHtml(issuerLegalName)}</strong> issued and attests to this letter.`;
    default:
      return `<strong>${escapeHtml(issuerLegalName)}</strong> attests to this credential.`;
  }
}

/**
 * The honest, CONDITIONAL trusted-timestamp line. Rendered ONLY when the route
 * handler verified an RFC-3161 token over this record's raw ML-DSA signature
 * bytes. States WHEN the signature provably existed; never implies a legal
 * guarantee. Returns '' when no verified timestamp is present.
 */
function timestampLine(ts: CredentialPageInput['trustedTimestamp']): string {
  if (!ts) return '';
  const subject = (ts.tsaSubject ?? '').trim();
  const when = (ts.genTime ?? '').trim();
  const by = subject ? ` by ${escapeHtml(subject)}` : '';
  const at = when ? ` at ${escapeHtml(when)}` : '';
  return `
      <p class="trust trust-ts" aria-label="Trusted timestamp">Independently timestamped${by}${at}
      (RFC&#8209;3161): a third party attested WHEN this signature existed, so it could not have been
      back-dated. This is independently-verifiable forensic evidence, not a legal guarantee.</p>`;
}

/* ═══════════════════════ the three worlds (set pieces) ═══════════════════════ */

/** World I art: the post-quantum lattice, one basis path lit. Decorative. */
function latticeArt(lit: boolean): string {
  const nodes: string[] = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 9; col++) {
      const x = 24 + col * 34;
      const y = 22 + row * 28;
      const isLit = lit && ((row === 1 && col === 2) || (row === 2 && col === 5));
      nodes.push(`<circle cx="${x}" cy="${y}" r="${isLit ? 3.4 : 2.1}" class="${isLit ? 'art-node--lit' : 'art-node'}"/>`);
    }
  }
  const path = lit
    ? `<path class="art-line art-draw" d="M92,50L160,50L194,78L262,78"/><circle cx="92" cy="50" r="5.6" fill="none" class="art-line"/><circle cx="262" cy="78" r="5.6" fill="none" class="art-line"/>`
    : `<path class="art-line--soft art-line" d="M92,50L160,50L194,78L262,78"/>`;
  return `<svg viewBox="0 0 330 120" aria-hidden="true" focusable="false">${nodes.join('')}${path}</svg>`;
}

/** World II art: the chain of signed heads + the external anchor satellite. */
function chainArt(seq: number, anchored: boolean): string {
  const blocks: string[] = [];
  for (let i = 0; i < 5; i++) {
    const x = 18 + i * 60;
    const isLeaf = i === 3;
    blocks.push(`<rect x="${x}" y="64" width="44" height="30" rx="5" class="${isLeaf ? 'art-node--lit' : 'art-node'}"/>`);
    if (i < 4) blocks.push(`<path class="art-line" d="M${x + 44},79L${x + 60},79"/>`);
  }
  const anchorCls = anchored ? 'art-anchor--ok' : 'art-anchor--pending';
  return `<svg viewBox="0 0 330 120" aria-hidden="true" focusable="false">
    ${blocks.join('')}
    <text x="218" y="83" text-anchor="middle" class="art-text--big">${escapeHtml(`#${seq}`)}</text>
    <text x="40" y="110" class="art-text art-text--dim">signed heads</text>
    <g class="${anchorCls}">
      <path class="art-chain-link" d="M240,64C252,44 268,36 284,32"/>
      <circle cx="292" cy="30" r="9" class="art-node"/>
      <circle cx="292" cy="30" r="3.2" class="art-anchor-dot"/>
      <text x="292" y="14" text-anchor="middle" class="art-text">${anchored ? 'anchored' : 'pending'}</text>
    </g>
  </svg>`;
}

/** World III art: the dial. Hands engraved at the verified genTime (UTC), or a
 * dim handless dial when no independent timestamp exists (an honest absence). */
function clockArt(genTime?: string): string {
  const ticks: string[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * 2 * Math.PI;
    const x1 = 165 + Math.sin(a) * 41, y1 = 60 - Math.cos(a) * 41;
    const x2 = 165 + Math.sin(a) * 46, y2 = 60 - Math.cos(a) * 46;
    ticks.push(`<path class="art-tick" d="M${x1.toFixed(1)},${y1.toFixed(1)}L${x2.toFixed(1)},${y2.toFixed(1)}"/>`);
  }
  let hands = `<text x="165" y="64" text-anchor="middle" class="art-text art-text--dim">—</text>`;
  if (genTime) {
    const d = new Date(genTime);
    if (!Number.isNaN(d.getTime())) {
      const hourDeg = ((d.getUTCHours() % 12) + d.getUTCMinutes() / 60) * 30;
      const minDeg = d.getUTCMinutes() * 6;
      hands = `<path class="art-hand" d="M165,60L165,36" transform="rotate(${hourDeg.toFixed(1)} 165 60)"/>
      <path class="art-hand art-hand--minute" d="M165,60L165,26" transform="rotate(${minDeg.toFixed(1)} 165 60)"/>
      <circle cx="165" cy="60" r="2.6" class="art-glow"/>`;
    }
  }
  return `<svg viewBox="0 0 330 120" aria-hidden="true" focusable="false">
    <circle cx="165" cy="60" r="46" class="art-dial"/>
    ${ticks.join('')}
    ${hands}
  </svg>`;
}

/** One status line under a world: the real, record-scoped state of that check. */
function worldFact(cls: 'pass' | 'warn' | 'fail' | 'idle', text: string): string {
  return `        <p class="world__fact ${cls}"><span class="st" aria-hidden="true"></span>${escapeHtml(text)}</p>`;
}

/**
 * The THREE WORLDS section for a credential: each chapter explains one pillar
 * of the verification and states what was actually verified for THIS record
 * (the same server-computed checks as the ledger; never an invented state).
 */
function worldsSection(
  checks: VerificationChecks,
  record: CredentialRecord,
  ts: CredentialPageInput['trustedTimestamp'],
): string {
  const sig = checks.mldsaSignature;
  const log = checks.logInclusion;
  const anchored = checks.anchorProof;
  const tsDay = (ts?.genTime ?? '').slice(0, 10);
  const tsDate = /^\d{4}-\d{2}-\d{2}$/.test(tsDay) ? formatIssueDate(tsDay) : '';
  return `      <ol class="worlds" aria-label="The three worlds this verification crosses">
        <li class="world reveal">
          <div class="world__head"><span class="world__num">World I</span><h3 class="world__title">The Signature</h3></div>
          <p class="world__copy">Every fact on this page is bound into one canonical record and signed with
          <strong>ML&#8209;DSA&#8209;87</strong> (NIST FIPS&nbsp;204), a lattice-based, post-quantum signature scheme.
          Change one character of the record and the signature fails; a quantum computer does not change that.</p>
          <div class="world__art">${latticeArt(sig)}</div>
${worldFact(sig ? 'pass' : 'fail', sig ? 'Signature verified for this record' : 'Signature check failed for this record')}
        </li>
        <li class="world reveal">
          <div class="world__head"><span class="world__num">World II</span><h3 class="world__title">The Ledger</h3></div>
          <p class="world__copy">Issuance is entered in a public, append-only, tamper-evident transparency log;
          successive signed heads form a hash chain, so silently rewriting history is detectable. This record holds
          sequence <strong>#${escapeHtml(String(record.logSeq))}</strong>. Where external anchoring is enabled, new
          heads may additionally be published to a public GitHub repository (best-effort).</p>
          <div class="world__art">${chainArt(record.logSeq, anchored)}</div>
${worldFact(log ? 'pass' : 'fail', log ? 'Recorded in the transparency log' : 'Not found in the transparency log')}
${worldFact(anchored ? 'pass' : 'warn', anchored ? 'Head published to the public GitHub log' : 'Head publication pending')}
        </li>
        <li class="world reveal">
          <div class="world__head"><span class="world__num">World III</span><h3 class="world__title">The Clock</h3></div>
          <p class="world__copy">${
            ts
              ? `An independent time-stamping authority attested <strong>when</strong> this signature existed
          (RFC&#8209;3161), so it cannot have been created later and back-dated${tsDate ? ` to ${escapeHtml(tsDate)}` : ''}.`
              : `No independent timestamp was obtained for this record, so the signing time is not independently
          corroborated; the signature and ledger checks above stand on their own.`
          }</p>
          <div class="world__art">${clockArt(ts?.genTime)}</div>
${worldFact(ts ? 'pass' : 'idle', ts ? `Independently timestamped${tsDate ? ` ${tsDate}` : ''} (RFC-3161)` : 'No independent timestamp for this record')}
        </li>
      </ol>`;
}

/* ═══════════════════════════════ the <head> ═════════════════════════════════ */

/**
 * The shared <head>: meta, two font preloads, and the single nonce'd <style>
 * carrying the standalone Examination Chamber sheet (comments stripped).
 */
function head(nonce: string, title: string): string {
  const css = verifyCinemaCss().replace(/\/\*[\s\S]*?\*\//g, '');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light">
<meta name="theme-color" content="#F7F9FC">
<title>${escapeHtml(title)}</title>
<meta name="robots" content="noindex">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png?v=2">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=2">
<link rel="preload" as="font" type="font/woff2" href="/fonts/playfair-display-latin-700-normal.woff2" crossorigin>
<link rel="preload" as="font" type="font/woff2" href="/fonts/marcellus-latin-400-normal.woff2" crossorigin>
<style nonce="${nonce}">
${css}
</style>
</head>`;
}

/* ═══════════════════════════════ the pages ══════════════════════════════════ */

/**
 * The branded 404 page (HTML, not JSON) for an unknown / malformed id, OR — when
 * `erased` is set — the PII-free TOMBSTONE for a record erased under DPDP §8(7).
 * The erased copy is informative (the document existed and was erased on request)
 * and never alarm-red: erasure is not forgery or revocation.
 */
export function renderErrorPage(input: { nonce: string; issuer: string; erased?: boolean }): string {
  const { nonce, issuer, erased } = input;
  // Neutral, never alarm-red: a mistyped QR is not a forgery.
  const v = verdictCopy('unknown');
  const issuerTagline = issuer.replace(/^dmj\.one\s+/i, '').trim() || issuer;
  const pageTitle = erased ? 'Document erased' : 'Credential not found';
  const heading = erased ? 'Document erased' : 'Credential not found';
  const subCopy = erased
    ? 'This document was erased at the data principal&rsquo;s request. Its contents are no longer available.'
    : 'No credential matches this link. Check the ID or the QR code on the document.';
  const whyEk = erased ? 'Erased' : 'Not found';
  const statusLabel = erased ? 'ERASED' : 'UNKNOWN';
  const statusDetail = erased
    ? subCopy
    : 'No credential matches this link. Check the ID or the QR code on the certificate.';
  const whyTrust = erased
    ? `This document existed and carried a genuine ${escapeHtml(issuer)} attestation, but the person it was about asked us to erase it under their data-protection rights, so its personal data has been removed. A cryptographic record of its existence is retained with no personal data. This does not mean the document was forged or revoked.`
    : `If you scanned a QR code from a printed certificate and reached this page, the
      credential may have been mistyped or may not exist. ${escapeHtml(issuer)} only attests to credentials it has issued.
      You can re-enter the ID at <a href="/">the verification portal</a>.`;
  return `${head(nonce, `${pageTitle} · ${IDENTITY.trustService}`)}
<body data-page="error">
  <a class="skip" href="#main">Skip to content</a>
${stageLayers()}
  <main id="main" class="wrap verify">
    <section class="hero" aria-labelledby="nf-title">
      <span class="hero__frame" aria-hidden="true"></span>
      <span class="hero__beams" aria-hidden="true"></span>

      <header class="brand trustmark">
        <span class="mark"><b>dmj</b>.one</span>
        <span class="svc">${escapeHtml(issuerTagline)}</span>
      </header>

      <div class="hero__core">
        <div class="identity">
          <p class="eyebrow">Verification</p>
          <h1 class="type-title" id="nf-title">${escapeHtml(heading)}</h1>
        </div>

        <div class="verdict ${v.cls}" id="verdict">
${ROSETTE_SVG}
          <p class="word"><span class="glyph" aria-hidden="true">${escapeHtml(v.glyph)}</span><span id="verdict-word">${escapeHtml(v.word)}</span></p>
          <p class="sub" id="verdict-sub">${subCopy}</p>
${heroHonestyLine()}
        </div>
      </div>

      <a class="scrollcue" href="#why">
        <span>What this means</span>
        <span class="chev" aria-hidden="true"></span>
      </a>
    </section>

    <section class="proof" id="why" aria-labelledby="why-h">
      <div class="proof__intro">
        <p class="ek">${escapeHtml(whyEk)}</p>
        <h2 id="why-h">Why you may be seeing this</h2>
      </div>
      <div class="status unknown" role="status">
        <span class="dot" aria-hidden="true"></span>
        <span class="txt"><b>${statusLabel}</b><span>${statusDetail}</span></span>
      </div>
      <p class="trust">${whyTrust}</p>
    </section>

    <footer class="foot">${escapeHtml(IDENTITY.trustService)} · ${escapeHtml(IDENTITY.email)}</footer>
  </main>
  <script src="${cinemaAssetPath()}" defer></script>
</body>
</html>`;
}

/**
 * The public landing page at `/`: the portal's front door on the same midnight
 * stage. The hero asks the visitor's literal question ("Is it genuine?"); the
 * credential page answers it ("Genuine."). ONE action above the fold: the
 * lookup instrument. No seal here; gold "Verified" iconography is never shown
 * before anything is verified. The form GETs `/?id=…` (works with JS off).
 */
export function renderLandingPage(input: { nonce: string; issuer: string; queriedId?: string }): string {
  const { nonce, issuer } = input;
  const issuerTagline = issuer.replace(/^dmj\.one\s+/i, '').trim() || issuer;
  // A rejected lookup must never bounce silently: echo the typed id back into
  // the field (escaped) with an inline, plain-language explanation.
  const queried = (input.queriedId ?? '').trim().slice(0, 80);
  const lookupErrorHtml = queried
    ? `
          <p class="lp-error" id="lp-error" role="alert"><strong>That doesn&rsquo;t look like a credential ID.</strong>
          The format is DMJ-XX-YYYYMMDD-NN, for example DMJ-IC-20260606-01, printed beside the QR code on the document.</p>`
    : '';
  return `${head(nonce, `Verify a credential · ${IDENTITY.trustService}`)}
<body data-page="landing">
  <a class="skip" href="#main">Skip to content</a>
${stageLayers()}
  <main id="main" class="wrap verify">
    <section class="hero hero--landing" aria-labelledby="lh">
      <span class="hero__frame" aria-hidden="true"></span>
      <span class="hero__beams" aria-hidden="true"></span>

      <header class="brand trustmark">
        <span class="mark"><b>dmj</b>.one</span>
        <span class="svc">${escapeHtml(issuerTagline)}</span>
      </header>

      <div class="hero__core">
        <p class="eyebrow">Public verification</p>
        <h1 class="type-title" id="lh">Is it genuine?</h1>
        <p class="lead">Every credential ${escapeHtml(IDENTITY.name)} issues answers that question here, cryptographically, in seconds.</p>

        <form class="lookup-plate" method="GET" action="/" role="search" aria-label="Verify by credential ID">
          <label class="lp-label" for="cred-id">Credential ID</label>
          <div class="lp-row">
            <input id="cred-id" name="id" type="text" inputmode="text" autocomplete="off"
                   autocapitalize="characters" spellcheck="false" enterkeyhint="go"
                   placeholder="DMJ-IC-20260606-01" aria-describedby="lp-hint${queried ? ' lp-error' : ''}" maxlength="64" required
                   pattern="\\s*[Dd][Mm][Jj]-[A-Za-z]{2,4}-[0-9]{8}-[0-9]{2}\\s*"
                   title="Credential IDs look like DMJ-IC-20260606-01"${queried ? `
                   value="${escapeHtml(queried)}"` : ''}>
            <button class="btn primary lp-go" type="submit">Verify</button>
          </div>${lookupErrorHtml}
          <p class="lp-hint" id="lp-hint">Printed beside the QR code on the document. Scanning the QR brings you here automatically.</p>
        </form>

        <p class="honesty">A cryptographic attestation by ${escapeHtml(IDENTITY.name)}, an independent educational initiative, not a government-licensed certifying authority.</p>
      </div>

      <a class="scrollcue" href="#how">
        <span>How it works</span>
        <span class="chev" aria-hidden="true"></span>
      </a>
    </section>

    <section class="proof how" id="how" aria-labelledby="how-h">
      <div class="proof__intro">
        <p class="ek">The method</p>
        <h2 id="how-h">What verification checks</h2>
      </div>

      <ol class="worlds">
        <li class="world reveal">
          <div class="world__head"><span class="world__num">01</span><h3 class="world__title">A post-quantum signature</h3></div>
          <p class="world__copy">Every credential is signed with ML-DSA-87 (FIPS&nbsp;204), a detached post-quantum signature over a canonical record of the credential&rsquo;s contents.</p>
          <div class="world__art">${latticeArt(false)}</div>
        </li>
        <li class="world reveal">
          <div class="world__head"><span class="world__num">02</span><h3 class="world__title">The document&rsquo;s exact bytes</h3></div>
          <p class="world__copy">The record binds the document&rsquo;s SHA-256 fingerprint. Change a single bit of the file and verification reports <strong>TAMPERED</strong>.</p>
        </li>
        <li class="world reveal">
          <div class="world__head"><span class="world__num">03</span><h3 class="world__title">A public transparency log</h3></div>
          <p class="world__copy">Issuance is entered in an append-only, tamper-evident log whose successive signed heads form a hash chain, so silently rewriting history is detectable.</p>
        </li>
        <li class="world reveal">
          <div class="world__head"><span class="world__num">04</span><h3 class="world__title">Revocation, checked live</h3></div>
          <p class="world__copy">A credential the issuer has withdrawn answers <strong>Revoked</strong>, plainly, at the top.</p>
        </li>
      </ol>

      <div class="ways reveal">
        <h3 class="block-h">Three ways to verify</h3>
        <ul>
          <li><b>Scan</b> the QR code printed on the document.</li>
          <li><b>Follow</b> the verification link beside it.</li>
          <li><b>Paste</b> the credential ID into the field above.</li>
        </ul>
      </div>

      <section class="explainer reveal" aria-labelledby="he">
        <h2 class="block-h" id="he">In technical terms</h2>
        <p>Each credential is bound by a detached post-quantum signature (ML-DSA-87) over a canonical record that includes the document&rsquo;s exact-bytes hash (SHA-256), and is entered in a public, append-only, tamper-evident transparency log whose successive signed heads form a hash chain. Where external anchoring is enabled, each new head may additionally be published to a public GitHub repository (github.com/divyamohan1993/dmjone-trust-anchor), giving a publicly-timestamped, externally-hosted commit record; because the log is an append-only chain of signed heads, any silent rewrite or back-dating is then detectable by anyone who has recorded an earlier head. (Publication is best-effort; this page shows whether the credential&rsquo;s head is published or still pending.) Change a single bit and verification reports <strong>TAMPERED</strong>. This is a self-signed cryptographic attestation by an independent educational initiative, not a licensed certifying-authority signature; the document itself carries no embedded signature.</p>
      </section>
    </section>

    <footer class="foot">
      ${escapeHtml(IDENTITY.trustService)} · ${escapeHtml(IDENTITY.email)} · <span class="motto">${escapeHtml(IDENTITY.motto)}</span>
    </footer>
  </main>
  <script src="${cinemaAssetPath()}" defer></script>
</body>
</html>`;
}

/** Render the full public credential page for a known record. */
export function renderCredentialPage(input: CredentialPageInput): string {
  const { record, issuer, issuerLegalName, nonce } = input;
  const kind = documentKind(record);
  const id = record.id;
  // WS2 token (new issuance) — drives every self-reference below; absent ⇒ legacy by-id.
  const tok = input.verifyToken;
  const face =
    kind === 'letter'
      ? letterFace(record.content as LetterContent, formatIssueDate((record.content as LetterContent).issueDate), issuer, id)
      : kind === 'upload'
        ? uploadFace(record.content as UploadAttestation, formatIssueDate((record.content as UploadAttestation).issueDate), issuer, id)
        : certificateFace(record.content as CredentialContent, formatIssueDate((record.content as CredentialContent).issueDate), issuer, id);
  const outcome = input.verification.outcome;

  // The record's lifecycle drives the "Status" pill below. The TOP verdict +
  // badge use the same outcome EXCEPT for a cryptographically-valid UPLOAD:
  // there the page refuses to assert the holder's FILE from the id/QR alone.
  const recordBadge = outcomeBadge(outcome, issuer);
  const fileGate = kind === 'upload' && outcome === 'valid';
  const badge = fileGate ? UPLOAD_FILEGATE_BADGE : recordBadge;
  const verdict = fileGate ? UPLOAD_FILEGATE_VERDICT : verdictCopy(outcome);

  const heroAffirmative = outcome === 'valid' && !fileGate;
  const heroHardFactHtml = heroHardFact(heroAffirmative, input.trustedTimestamp);
  const heroCompareHtml = heroCompareLine(heroAffirmative, kind);
  const heroHonestyHtml = heroHonestyLine();

  // The upload file-gate dropzone, IN THE HERO: the one action the visitor
  // must take lives in the first view, not below the fold (the form also
  // posts to /api/verify/file without JS). Only a byte-for-byte match earns
  // green, and the verdict above it flips exactly as the live check answers.
  const fileGateHtml = fileGate
    ? `
        <!-- Anti-spoof FILE gate (uploads only): a scanned QR/number proves the
             RECORD exists, never that THIS file is the attested one. Green is
             earned solely when the dropped file's bytes match /api/verify/file. -->
        <div class="filecheck" id="filecheck">
          <p class="fc-lead">Confirm the document you&rsquo;re holding</p>
          <p class="fc-why">A QR code or document number can be copied onto any file. So we verify the file itself: its exact bytes must match the post-quantum signature we issued, and an altered or substituted file cannot pass.</p>
          <form id="fc-form" method="POST" action="/api/verify/file" enctype="multipart/form-data">
            ${tok
              ? `<input type="hidden" name="verifyToken" value="${escapeHtml(tok)}">`
              : `<input type="hidden" name="credentialId" value="${escapeHtml(id)}">`}
            <div class="fc-drop" id="fc-drop">
              <label class="fc-cta" for="fc-input">Drop the PDF here, or choose a file</label>
              <input class="fc-input" id="fc-input" name="file" type="file" accept="application/pdf,.pdf" required>
              <button class="btn primary" type="submit" id="fc-submit">Check this file</button>
            </div>
          </form>
          <p class="fc-note">Checked against the ML&#8209;DSA&#8209;87 signature and tamper&#8209;evident log we issued, not a simple checksum. Fingerprint <code class="mono">${escapeHtml(maskHash(record.pdfSha256))}</code>.</p>
          <p class="fc-msg" id="fc-msg" role="status" aria-live="polite"></p>
        </div>`
    : '';

  // Pre-render each check row with its server-computed state, so the ledger is
  // meaningful (and honest) before any script runs. For an upload the FIRST
  // check is the decisive file-integrity check, NEUTRAL until a file arrives.
  const checkRows: Array<{ key: keyof VerificationChecks; label: string }> = [
    ...(fileGate
      ? [{ key: 'hashMatch' as const, label: 'Your file matches the attested document, byte for byte' }]
      : []),
    { key: 'mldsaSignature', label: 'Post-quantum signature (ML-DSA-87)' },
    { key: 'logInclusion', label: 'Transparency-log inclusion: recorded in our public, tamper-evident log' },
    { key: 'anchorProof', label: 'External anchor (public GitHub log)' },
    { key: 'notRevoked', label: 'Not revoked by issuer' },
  ];
  const checksHtml = checkRows
    .map((row) => {
      const isFileRow = fileGate && row.key === 'hashMatch';
      const cls = isFileRow ? '' : checkClass(row.key, input.verification.checks[row.key]);
      const word = isFileRow
        ? 'Awaiting your file'
        : cls === 'pass'
          ? 'Passed'
          : cls === 'fail'
            ? 'Failed'
            : cls === 'warn'
              ? 'Pending'
              : 'Checking';
      const fileAttr = isFileRow ? ' data-filecheck="1"' : '';
      return `          <li data-check="${row.key}"${fileAttr} class="${cls}"><span class="ic" aria-hidden="true"></span><span>${escapeHtml(row.label)}</span><span class="sr-only" data-check-status>${word}</span></li>`;
    })
    .join('\n');

  // A tokened (new) record is reachable ONLY via /v/<token>; its sequential id is
  // not a public lookup key, so every self-reference routes through the token.
  const section63Path = tok
    ? `/v/${encodeURIComponent(tok)}/section63`
    : `/api/credentials/${encodeURIComponent(id)}/section63`;
  const evidencePath = tok
    ? `/v/${encodeURIComponent(tok)}/evidence`
    : `/api/credentials/${encodeURIComponent(id)}/evidence`;
  const verifyApiPath = tok
    ? `/api/verify/by-token/${encodeURIComponent(tok)}`
    : `/api/verify/${encodeURIComponent(id)}`;
  const issuerTagline = issuer.replace(/^dmj\.one\s+/i, '').trim() || issuer;

  return `${head(nonce, face.pageTitle)}
<body data-page="credential" data-credential-id="${escapeHtml(id)}" data-verify-token="${escapeHtml(tok ?? '')}" data-verify-url="${escapeHtml(verifyApiPath)}" data-filegate="${fileGate ? '1' : '0'}">
  <a class="skip" href="#main">Skip to content</a>
${stageLayers()}
  <main id="main" class="wrap verify">

    <!-- ============ ABOVE THE FOLD: the cinematic hero ============ -->
    <!-- One thing, beautifully: the document identity, THE VERDICT, the struck
         gold seal (revealed + stamped by the client ONLY on a live VALID), and
         a scroll cue. The verdict + seal gating are server-correct without JS. -->
    <section class="hero" aria-labelledby="cred-title">
      <span class="hero__frame" aria-hidden="true"></span>
      <span class="hero__beams" aria-hidden="true"></span>

      <header class="brand trustmark">
        <span class="mark"><b>dmj</b>.one</span>
        <span class="svc">${escapeHtml(issuerTagline)}</span>
      </header>

      <div class="hero__core">
        <div class="identity">
${face.hero}
        </div>

        <!-- The plain-language verdict, server-rendered from the authoritative
             outcome so it is correct without JavaScript. The guilloche rosette
             behind it is security-print ornament; the seal lives INSIDE
             .verdict so .verdict.valid.sealed gates it. -->
        <div class="verdict ${verdict.cls}" id="verdict">
${ROSETTE_SVG}
${seal()}
          <p class="word"><span class="glyph" aria-hidden="true">${escapeHtml(verdict.glyph)}</span><span id="verdict-word">${escapeHtml(verdict.word)}</span></p>
${heroHardFactHtml ? '' : `          <p class="sub" id="verdict-sub">${escapeHtml(verdict.sub)}</p>`}
${heroHardFactHtml}${heroCompareHtml}
${heroHonestyHtml}
        </div>
${fileGateHtml}
      </div>

      <a class="scrollcue" href="#proof">
        <span>Witness the proof</span>
        <span class="chev" aria-hidden="true"></span>
      </a>
    </section>

    <!-- ============ BELOW THE FOLD: the descent into the proof ============ -->
    <section class="proof" id="proof" aria-labelledby="proof-h">
      <div class="proof__intro">
        <p class="ek">The evidence</p>
        <h2 id="proof-h">The proof behind this verdict</h2>
      </div>

      <!-- The live status badge + per-check constellation, pre-rendered with
           the server-computed verdict so they are meaningful without
           JavaScript. The client re-runs the same checks live, ignites each
           node, and only then strikes the verdict. -->
      <h3 class="block-h" id="checks-h">Cryptographic checks</h3>
      <div class="status ${badge.cls}" id="status" role="status" aria-live="polite" data-ssr-outcome="${escapeHtml(outcome)}">
        <span class="dot" aria-hidden="true"></span>
        <span class="txt">
          <b id="status-label">${badge.label}</b>
          <span id="status-note">${escapeHtml(badge.note)}</span>
        </span>
      </div>
      <ul class="checks" id="checks" aria-labelledby="checks-h">
${checksHtml}
      </ul>

${worldsSection(input.verification.checks, record, input.trustedTimestamp)}

      <section class="facts reveal" aria-labelledby="facts-h">
        <h3 class="block-h" id="facts-h">${kind === 'certificate' ? 'Credential details' : 'Document details'}</h3>
        <dl class="grid">
${face.detailRows}
          <dt>Status</dt><dd><span class="pill ${recordBadge.cls}">${recordBadge.label}</span></dd>
        </dl>
      </section>

      <section class="trust reveal" aria-label="Trust statement">
        ${trustLead(kind, issuerLegalName)} A detached post-quantum
        cryptographic signature (ML-DSA-87) over the exact record establishes that it was issued by
        dmj.one and is unaltered, and the entry is recorded in a public, append-only, tamper-evident
        transparency log whose successive signed heads may, where external anchoring is enabled,
        additionally be published to a public GitHub repository
        (github.com/divyamohan1993/dmjone-trust-anchor) as an externally-hosted, publicly-timestamped
        commit record (best-effort; this credential&rsquo;s head shows above as published or still
        pending). This is a
        <strong>self-signed cryptographic attestation</strong> by an independent educational initiative;
        it is <strong>not</strong> a licensed certifying-authority Digital Signature Certificate, the
        document carries no embedded signature, and no claim of government accreditation is made.
        A BSA 2023 §63 certificate of authenticity is available below for legal use.
      </section>
${timestampLine(input.trustedTimestamp)}

      <div class="actions reveal">
        <a class="btn secondary" href="${section63Path}" id="dl-63">Download §63 certificate of authenticity</a>
        <a class="btn secondary" href="${evidencePath}" id="dl-evidence" download>Download court-ready evidence bundle</a>
        <a class="btn" href="#download-panel">Are you the recipient? Get your signed certificate</a>
      </div>
      <dl class="action-glosses reveal">
        <dt>§63 certificate of authenticity</dt><dd>a legal certificate of authenticity under BSA 2023.</dd>
        <dt>Court-ready evidence bundle</dt><dd>everything an expert needs to re-verify this offline.</dd>
      </dl>

      <!-- Password-gated download. The signed PDF (with the handwritten
           signature) is obtained ONLY here, by POST with the private password.
           There is deliberately no GET link to the certificate anywhere. -->
      <details class="panel reveal" id="download-panel">
        <summary>Download your signed certificate (recipient only)</summary>
        <div class="inner">
          <!-- Fails closed without JS: POSTs form-encoded to /api/download, which
               rejects (400) rather than leaking the password into a GET URL/logs.
               The engine upgrades this to a fetch + in-page download. -->
          <form id="dl-form" method="POST" action="/api/download" autocomplete="off">
            <input type="hidden" name="credentialId" value="${escapeHtml(id)}">
            <label for="dl-pass">Enter your private download password</label>
            <input id="dl-pass" name="password" type="password" autocomplete="current-password"
                   minlength="1" maxlength="128" required aria-describedby="dl-hint dl-msg">
            <div class="actions"><button class="btn primary" type="submit" id="dl-submit">Verify &amp; download PDF</button></div>
            <p class="msg" id="dl-hint">The password was set when the certificate was issued. Anyone holding the
            certificate file can verify it without a password; the password is only needed to <em>obtain</em> the file.</p>
            <p class="msg" id="dl-msg" role="status" aria-live="polite"></p>
          </form>
        </div>
      </details>

      <section class="explainer reveal" aria-labelledby="tamper-h">
        <h3 class="block-h" id="tamper-h">How tamper detection works</h3>
        <p>The certificate's exact bytes are hashed and that hash is covered by a post-quantum signature.
        Change a single bit anywhere in the file and the hash no longer matches, so verification reports
        <strong>TAMPERED</strong>. Change any field and the signature itself fails. Try it: upload a real or
        altered copy on the verification API and watch the result flip.</p>
        <p class="flip" aria-hidden="true">
          <span class="bit">0</span><span class="bit">1</span><span class="bit changed">0</span><span class="bit">1</span>
          <span>&nbsp;one flipped bit &rarr; TAMPERED</span>
        </p>
      </section>
    </section>

    <footer class="foot">
      Verified at <a href="${escapeHtml(input.verifyBaseUrl)}">${escapeHtml(input.verifyBaseUrl)}</a> ·
      ${escapeHtml(IDENTITY.trustService)} · ${escapeHtml(IDENTITY.email)} ·
      <span class="motto">${escapeHtml(IDENTITY.motto)}</span>
    </footer>
  </main>
  <script src="${cinemaAssetPath()}" defer></script>
</body>
</html>`;
}
