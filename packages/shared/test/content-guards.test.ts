/**
 * Content guards — the issue-time safety core. Two pure functions:
 *   findUnfilledSlot(text)            → the first leftover `[slot]`, or null
 *   findDenylistedTerm(text, opts)    → the first false-status / unsafe term, or null
 *
 * These back the boundary validators on issueCredentialSchema / issueLetterSchema.
 * They are the mechanical guard that stops a half-filled template ("[Name] interned
 * from [start]") or a false-status claim ("dmj.one, a registered company") from
 * being issued and cryptographically signed.
 */
import { describe, it, expect } from 'vitest';
import { findUnfilledSlot, findDenylistedTerm } from '../src/content-guards.js';

describe('findUnfilledSlot', () => {
  it('returns null for plain text and empty string', () => {
    expect(findUnfilledSlot('')).toBeNull();
    expect(findUnfilledSlot('A short factual sentence.')).toBeNull();
  });

  it('flags a single leftover bracket slot', () => {
    expect(findUnfilledSlot('Hello [Full legal name].')).toBe('[Full legal name]');
  });

  it('returns the FIRST slot when several remain', () => {
    expect(findUnfilledSlot('interned from [start date] to [end date]')).toBe('[start date]');
  });

  it('strips a single LEADING anchored [[align:…]] directive (parity with the renderer)', () => {
    expect(findUnfilledSlot('[[align:center]]This is to certify that.')).toBeNull();
    expect(findUnfilledSlot('[[align:left]]worked on [project]')).toBe('[project]');
  });

  it('only strips the directive when it is leading + a valid enum; a second one is literal and flags', () => {
    // The renderer's ALIGN_DIRECTIVE is anchored (^) and matches one of 4 enums.
    // Only the BEHAVIOR matters (a second/invalid directive is flagged as leftover);
    // the exact surfaced substring is an incidental error-message detail.
    expect(findUnfilledSlot('[[align:right]][[align:left]]x')).toContain('align:left');
    expect(findUnfilledSlot('[[align:bogus]]x')).not.toBeNull();
  });

  it('treats the reserved [auto] document-number token as already resolved', () => {
    expect(findUnfilledSlot('Document no. [auto]')).toBeNull();
    expect(findUnfilledSlot('[auto] issued; verify [link]')).toBe('[link]');
  });
});

describe('findDenylistedTerm', () => {
  it('returns null for clean factual prose', () => {
    expect(findDenylistedTerm('Aarav interned with dmj.one, an independent educational initiative.')).toBeNull();
  });

  it('flags false-status / registration claims (case-insensitive)', () => {
    expect(findDenylistedTerm('dmj.one, a COMPANY')).toBe('company');
    expect(findDenylistedTerm('a registered educational initiative')).toBe('registered');
    expect(findDenylistedTerm('Government-approved programme')).toBe('government-approved');
  });

  it('flags IT-Act / certifying-authority claims (the status this project most fears)', () => {
    expect(findDenylistedTerm('verified by a digital signature')).toBe('digital signature');
    expect(findDenylistedTerm('dmj.one is a certifying authority')).toBe('certifying authority');
  });

  it('does NOT false-positive on benign words that merely contain a term', () => {
    // \b word boundaries: "accompany" must not match "company".
    expect(findDenylistedTerm('we will accompany them to the venue')).toBeNull();
  });

  it('blocks employment terms ONLY for internship-scoped issuance', () => {
    expect(findDenylistedTerm('paid a monthly salary', { internship: true })).toBe('salary');
    expect(findDenylistedTerm('was an employee', { internship: true })).toBe('employee');
    // Outside internship scope these words are allowed (e.g. a contributor LOR may mention salary context).
    expect(findDenylistedTerm('paid a monthly salary', { internship: false })).toBeNull();
    expect(findDenylistedTerm('paid a monthly salary')).toBeNull();
  });
});
