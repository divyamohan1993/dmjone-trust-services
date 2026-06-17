/**
 * Zod schemas for API inputs. Validated server-side at every boundary; all
 * input is hostile until parsed here.
 */

import { z } from 'zod';
import { CREDENTIAL_ID_REGEX } from './constants.js';
import { findUnfilledSlot, findDenylistedTerm } from './content-guards.js';

export const credentialTypeSchema = z.enum([
  'internship',
  'completion',
  'appreciation',
  'experience',
  'participation',
]);

/**
 * A custom certificate type (mode 1): a short free-text label. Must start with a
 * letter and contain only letters, digits, spaces, and hyphens — the same
 * character class the ID-code derivation ({@link credentialTypeCode}) and the
 * Title-Case label ({@link labelForType}) consume. 2–40 chars, trimmed.
 */
export const customCredentialTypeSchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[a-z][a-z0-9 -]*$/i, 'expected letters, digits, spaces or hyphens; start with a letter');

/**
 * The certificate `type` accepted at issuance: one of the five presets OR a
 * custom label. The presets stay first-class (and a preset value parses via the
 * enum branch), so existing behavior/IDs are unchanged; a custom label rides the
 * same ornamental template with only the kicker/title/type varying.
 */
export const issueCredentialTypeSchema = z.union([
  credentialTypeSchema,
  customCredentialTypeSchema,
]);

/**
 * One field's content-guard checks (issue-time boundary): an unfilled `[slot]`
 * is always rejected; denylisted false-status/authority terms are rejected on
 * issuer-authored descriptive fields (`denylist: true`), never on a person's
 * name or a third-party address (which may legitimately be a company). The
 * `internship` flag additionally blocks employment/salary language.
 */
type GuardField = readonly [path: (string | number)[], value: string | undefined, denylist: boolean];

function guardFields(ctx: z.RefinementCtx, internship: boolean, fields: GuardField[]): void {
  for (const [path, value, denylist] of fields) {
    if (typeof value !== 'string' || value.length === 0) continue;
    const slot = findUnfilledSlot(value);
    if (slot) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...path], message: `Fill or remove the placeholder ${slot}.` });
      continue; // one issue per field is enough to block issuance
    }
    if (denylist) {
      const term = findDenylistedTerm(value, { internship });
      if (term) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...path],
          message: `Remove “${term}”: dmj.one is an independent educational initiative and cannot describe itself that way.`,
        });
      }
    }
  }
}

/**
 * Issue a new credential (issuer, authenticated). `issueCredentialObject` is the
 * bare shape (so preview routes can `.omit`); `issueCredentialSchema` layers the
 * content guards on top for the actual issue boundary.
 */
export const issueCredentialObject = z.object({
  type: issueCredentialTypeSchema,
  recipientName: z.string().trim().min(1).max(120),
  kicker: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1).max(60),
  intro: z.string().trim().min(1).max(120),
  bodyParagraphs: z.array(z.string().trim().min(1).max(1200)).min(1).max(6),
  closingLine: z.string().trim().max(200).optional(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD'),
  /** Issuer's good-faith attestation (facts true + authority + recipient hosting
   *  consent). Required to issue; recorded as a log entry, not a control. */
  attestation: z.literal(true),
  /** The candidate's private download password (gates the signed PDF). */
  password: z.string().min(8).max(128),
});

/** Content guard for a certificate; internship type also blocks employment language. */
export function applyCertGuard(
  v: {
    type: string; recipientName: string; kicker: string; title: string; intro: string;
    bodyParagraphs: string[]; closingLine?: string | undefined;
  },
  ctx: z.RefinementCtx,
): void {
  const internship = v.type === 'internship';
  guardFields(ctx, internship, [
    [['recipientName'], v.recipientName, false],
    [['kicker'], v.kicker, true],
    [['title'], v.title, true],
    [['intro'], v.intro, true],
    [['closingLine'], v.closingLine, true],
    ...v.bodyParagraphs.map((p, i): GuardField => [['bodyParagraphs', i], p, true]),
  ]);
}

export const issueCredentialSchema = issueCredentialObject.superRefine(applyCertGuard);
export type IssueCredentialInput = z.infer<typeof issueCredentialSchema>;

/** Issue a new letterhead letter (issuer, authenticated). The rich body reuses
 *  the certificate body markup grammar. `scope: 'internship'` marks an internship
 *  offer letter / LOR so employment/salary language is blocked. */
export const issueLetterObject = z.object({
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD'),
  reference: z.string().trim().max(120).optional(),
  recipientLines: z.array(z.string().trim().max(120)).max(8).default([]),
  subject: z.string().trim().max(160).optional(),
  salutation: z.string().trim().max(120).optional(),
  bodyParagraphs: z.array(z.string().trim().min(1).max(1200)).min(1).max(40),
  valediction: z.string().trim().max(80).optional(),
  /** Internship-group letters set this so employment/salary language is blocked. */
  scope: z.enum(['internship']).optional(),
  /** Issuer's good-faith attestation (facts true + authority + recipient hosting
   *  consent). Required to issue; recorded as a log entry, not a control. */
  attestation: z.literal(true),
  /** The recipient's private download password (gates the signed PDF). */
  password: z.string().min(8).max(128),
});

/** Content guard for a letter; recipient address lines are NOT denylist-scanned
 *  (the addressee may legitimately be a registered company). */
export function applyLetterGuard(
  v: {
    reference?: string | undefined; recipientLines: string[]; subject?: string | undefined;
    salutation?: string | undefined; bodyParagraphs: string[]; valediction?: string | undefined;
    scope?: 'internship' | undefined;
  },
  ctx: z.RefinementCtx,
): void {
  const internship = v.scope === 'internship';
  guardFields(ctx, internship, [
    [['reference'], v.reference, true],
    [['subject'], v.subject, true],
    [['salutation'], v.salutation, true],
    [['valediction'], v.valediction, true],
    ...v.recipientLines.map((l, i): GuardField => [['recipientLines', i], l, false]),
    ...v.bodyParagraphs.map((p, i): GuardField => [['bodyParagraphs', i], p, true]),
  ]);
}

export const issueLetterSchema = issueLetterObject.superRefine(applyLetterGuard);
export type IssueLetterInput = z.infer<typeof issueLetterSchema>;

/**
 * Metadata accompanying an uploaded-&-signed PDF (issuer, authenticated). The
 * PDF bytes themselves are validated by the Phase-2 route, not here; this
 * covers only the attestation fields and the optional per-page signature
 * placements (one entry per page the signature is stamped on, each with its
 * own position and size).
 */
export const signUploadSchema = z.object({
  originalFilename: z.string().min(1).max(200),
  placeHandwrittenSignature: z.boolean().default(false),
  signaturePlacements: z
    .array(
      z.object({
        page: z.number().int().min(1),
        xPct: z.number().min(0).max(1),
        yPct: z.number().min(0).max(1),
        wPct: z.number().min(0.02).max(1),
      }),
    )
    .min(1)
    .max(50)
    .optional(),
  /** Issuer's good-faith attestation (facts true + authority + recipient hosting
   *  consent). Required to attest; recorded as a log entry, not a control. */
  attestation: z.literal(true),
  /** The recipient's private download password (gates the signed PDF). */
  password: z.string().min(8).max(128),
});
export type SignUploadInput = z.infer<typeof signUploadSchema>;

/** Password-gated download (public verify service). */
export const downloadSchema = z.object({
  credentialId: z.string().regex(CREDENTIAL_ID_REGEX),
  password: z.string().min(1).max(128),
});
export type DownloadInput = z.infer<typeof downloadSchema>;

/** Path param for credential-id routes. */
export const credentialIdParamSchema = z.object({
  credentialId: z.string().regex(CREDENTIAL_ID_REGEX),
});

/** Revoke a credential (issuer, authenticated). */
export const revokeSchema = z.object({
  credentialId: z.string().regex(CREDENTIAL_ID_REGEX),
  reason: z.string().trim().max(300).optional(),
});
export type RevokeInput = z.infer<typeof revokeSchema>;
