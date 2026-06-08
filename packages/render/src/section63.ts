/**
 * {@link Section63Generator} factory (Stream E).
 *
 *   - `metadata(content, pdfSha256)` is pure: it fixes the §63 particulars
 *     (hash, producer, production method, device, timestamp) that get persisted
 *     on the credential record at issue-time.
 *   - `generate(record)` renders the court-presentable §63 PDF from the stored
 *     record + its persisted `section63` metadata, through the same Chromium
 *     print path as the certificate. It never recomputes the hash.
 */

import type {
  CredentialContent,
  CredentialRecord,
  Section63Generator,
  Section63Metadata,
} from '@dmjone/shared';
import { buildSection63Html } from './section63-template.js';
import { createChromiumRenderer, type ChromiumRendererOptions, type HtmlToPdf } from './chromium.js';

export interface Section63GeneratorDeps extends ChromiumRendererOptions {
  /** Inject the HTML→PDF step; defaults to a fresh Chromium renderer. Tests pass a fake. */
  htmlToPdf?: HtmlToPdf;
  /**
   * Clock for `generatedAt`, injectable for deterministic tests. Returns an
   * ISO-8601 instant. Defaults to the real wall clock.
   */
  now?: () => string;
}

/** Where and how the record is produced — the honest §63 particulars (spec §7). */
const PRODUCED_BY = 'dmj.one Trust Services (Google Cloud Run, asia-east1)';

const PRODUCTION_METHOD =
  'The electronic record is a PDF document produced by the issuer in one of two ways: ' +
  'a certificate or letter is rendered from structured field data by a headless Chromium ' +
  'browser, while an uploaded document is stamped with a validation identifier and QR. ' +
  'The resulting PDF is retained byte-for-byte and is not modified in place thereafter; ' +
  'the delivered PDF carries no embedded digital-signature object. Its SHA-256 hash is ' +
  'computed, and a detached post-quantum ML-DSA-87 (NIST FIPS 204) signature is produced ' +
  'over the canonical record of the document, which includes that SHA-256 hash. The record ' +
  'and signature are retained in the issuer records and appended to a public, append-only, ' +
  'tamper-evident transparency log (a hash chain of ML-DSA-87-signed heads). Verification is ' +
  'public and password-free at verify.dmj.one, by scanning the QR or entering the ' +
  'document identifier.';

const DEVICE_PARTICULARS =
  'Google Cloud Run managed compute (Linux x86-64 container), region asia-east1; ' +
  'Node.js runtime; system Chromium (headless) for rendering certificates and letters; ' +
  'pdf-lib for PDF stamping and QR embedding; @noble/post-quantum for detached ML-DSA-87 ' +
  'signing; signing keys held encrypted at rest (AES-256-GCM) in Google Secret Manager and ' +
  'loaded only by the issuer service at issue-time; Google Cloud Firestore for the record ' +
  'and transparency-log storage.';

/** Build a {@link Section63Generator}. Pure DI; no globals. */
export function createSection63Generator(deps: Section63GeneratorDeps = {}): Section63Generator {
  const htmlToPdf: HtmlToPdf = deps.htmlToPdf ?? createChromiumRenderer(deps);
  const now: () => string = deps.now ?? (() => new Date().toISOString());

  return {
    metadata(_content: CredentialContent, pdfSha256: string): Section63Metadata {
      return {
        hashValue: pdfSha256,
        hashAlgorithm: 'SHA-256',
        producedBy: PRODUCED_BY,
        productionMethod: PRODUCTION_METHOD,
        deviceParticulars: DEVICE_PARTICULARS,
        generatedAt: now(),
      };
    },

    async generate(record: CredentialRecord): Promise<Uint8Array> {
      const html = buildSection63Html(record, record.section63);
      return htmlToPdf(html);
    },
  };
}
