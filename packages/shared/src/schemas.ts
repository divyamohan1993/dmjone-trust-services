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

/** Issue a new credential (issuer, authenticated). */
export const issueCredentialSchema = z.object({
  type: credentialTypeSchema,
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
