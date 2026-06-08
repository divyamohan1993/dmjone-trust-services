/**
 * Zod schemas for API inputs. Validated server-side at every boundary; all
 * input is hostile until parsed here.
 */

import { z } from 'zod';
import { CREDENTIAL_ID_REGEX } from './constants.js';

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

/** Issue a new credential (issuer, authenticated). */
export const issueCredentialSchema = z.object({
  type: issueCredentialTypeSchema,
  recipientName: z.string().trim().min(1).max(120),
  kicker: z.string().trim().min(1).max(60),
  title: z.string().trim().min(1).max(60),
  intro: z.string().trim().min(1).max(120),
  bodyParagraphs: z.array(z.string().trim().min(1).max(1200)).min(1).max(6),
  closingLine: z.string().trim().max(200).optional(),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD'),
  /** The candidate's private download password (gates the signed PDF). */
  password: z.string().min(8).max(128),
});
export type IssueCredentialInput = z.infer<typeof issueCredentialSchema>;

/** Issue a new letterhead letter (issuer, authenticated). The rich body reuses
 *  the certificate body markup grammar. */
export const issueLetterSchema = z.object({
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD'),
  reference: z.string().trim().max(120).optional(),
  recipientLines: z.array(z.string().trim().max(120)).max(8).default([]),
  subject: z.string().trim().max(160).optional(),
  salutation: z.string().trim().max(120).optional(),
  bodyParagraphs: z.array(z.string().trim().min(1).max(1200)).min(1).max(40),
  valediction: z.string().trim().max(80).optional(),
  /** The recipient's private download password (gates the signed PDF). */
  password: z.string().min(8).max(128),
});
export type IssueLetterInput = z.infer<typeof issueLetterSchema>;

/**
 * Metadata accompanying an uploaded-&-signed PDF (issuer, authenticated). The
 * PDF bytes themselves are validated by the Phase-2 route, not here; this
 * covers only the attestation fields and the optional signature placement.
 */
export const signUploadSchema = z.object({
  originalFilename: z.string().min(1).max(200),
  placeHandwrittenSignature: z.boolean().default(false),
  signaturePlacement: z
    .object({
      page: z.number().int().min(1),
      xPct: z.number().min(0).max(1),
      yPct: z.number().min(0).max(1),
      wPct: z.number().min(0.02).max(1),
    })
    .optional(),
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
