/**
 * Mode-1 (custom certificate type) contract: the schema relaxation, the ID-code
 * derivation, and the display-label helper. The five presets MUST be untouched
 * (exact codes + labels, so every already-issued certificate id/sequence is
 * unaffected); a custom type must validate, yield a 2–4 letter code that keeps
 * the assembled id valid, and Title-Case for display.
 */

import { describe, expect, it } from 'vitest';

import {
  CREDENTIAL_ID_REGEX,
  CREDENTIAL_TYPE_CODES,
  CREDENTIAL_TYPE_LABELS,
  CREDENTIAL_TYPE_PRESETS,
  credentialTypeCode,
  issueCredentialSchema,
  labelForType,
  titleCase,
} from '../src/index.js';

/** Assemble an id with `code` the way the issuer allocator does, to assert validity. */
function idWith(code: string): string {
  return `DMJ-${code}-20260605-01`;
}

describe('credentialTypeCode — presets are frozen', () => {
  it('returns each preset its EXACT existing code', () => {
    expect(credentialTypeCode('internship')).toBe('IC');
    expect(credentialTypeCode('completion')).toBe('CC');
    expect(credentialTypeCode('appreciation')).toBe('AC');
    expect(credentialTypeCode('experience')).toBe('EC');
    expect(credentialTypeCode('participation')).toBe('PC');
  });

  it('matches CREDENTIAL_TYPE_CODES for every preset (single source of truth)', () => {
    for (const preset of CREDENTIAL_TYPE_PRESETS) {
      expect(credentialTypeCode(preset)).toBe(CREDENTIAL_TYPE_CODES[preset]);
      // …and the assembled id is well-formed.
      expect(idWith(credentialTypeCode(preset))).toMatch(CREDENTIAL_ID_REGEX);
    }
  });
});

describe('credentialTypeCode — custom types', () => {
  it('derives the first up-to-4 uppercased [A-Z]', () => {
    // The first FOUR letters of the uppercased string (not first-of-each-word):
    // "AWARD OF MERIT" → letters "AWARDOFMERIT" → "AWAR".
    expect(credentialTypeCode('award of merit')).toBe('AWAR');
    expect(credentialTypeCode('Recognition')).toBe('RECO');
    expect(credentialTypeCode('honor')).toBe('HONO');
    expect(credentialTypeCode('merit')).toBe('MERI');
  });

  it('ignores digits, spaces, and hyphens when collecting letters', () => {
    expect(credentialTypeCode('award-2026')).toBe('AWAR');
    expect(credentialTypeCode('b 7 c')).toBe('BC'); // only B and C are letters
  });

  it('falls back to CRT when fewer than two letters survive', () => {
    // Schema-valid one-letter cases (start-with-letter, then digits/spaces/hyphens).
    expect(credentialTypeCode('a1')).toBe('CRT');
    expect(credentialTypeCode('x-9')).toBe('CRT');
    expect(credentialTypeCode('b 7')).toBe('CRT');
  });

  it('always yields a code that keeps the assembled id valid (the load-bearing invariant)', () => {
    for (const type of ['award of merit', 'a1', 'x-9', 'b 7', 'Recognition', 'b 7 c', 'award-2026']) {
      const code = credentialTypeCode(type);
      expect(code).toMatch(/^[A-Z]{2,4}$/);
      expect(idWith(code)).toMatch(CREDENTIAL_ID_REGEX);
    }
  });
});

describe('labelForType / titleCase — display labels', () => {
  it('keeps the preset labels exactly', () => {
    expect(labelForType('internship')).toBe('Internship');
    expect(labelForType('completion')).toBe('Completion');
    expect(labelForType('appreciation')).toBe('Appreciation');
    expect(labelForType('experience')).toBe('Experience');
    expect(labelForType('participation')).toBe('Participation');
  });

  it('each preset label equals titleCase(key) — so the fallback is a safe drop-in', () => {
    for (const preset of CREDENTIAL_TYPE_PRESETS) {
      expect(CREDENTIAL_TYPE_LABELS[preset]).toBe(titleCase(preset));
      expect(labelForType(preset)).toBe(titleCase(preset));
    }
  });

  it('Title-Cases an unknown/custom type', () => {
    expect(labelForType('award of merit')).toBe('Award Of Merit');
    expect(labelForType('RECOGNITION')).toBe('Recognition');
    expect(labelForType('hall-of-fame entry')).toBe('Hall-Of-Fame Entry');
  });

  it('titleCase is locale-independent and collapses case', () => {
    expect(titleCase('hELLo wORLD')).toBe('Hello World');
    expect(titleCase('  spaced  out  ')).toBe('Spaced  Out');
  });
});

describe('issueCredentialSchema.type — relaxed but backward-compatible', () => {
  /** A minimal valid issuance body; `type` is overridden per-case. */
  function body(type: unknown): Record<string, unknown> {
    return {
      type,
      recipientName: 'Asha Rao',
      kicker: 'Certificate of',
      title: 'MERIT',
      intro: 'This is to certify that',
      bodyParagraphs: ['did the thing.'],
      issueDate: '2026-06-05',
      attestation: true,
      password: 'a-strong-password', // pragma: allowlist secret
    };
  }

  it('accepts all five presets', () => {
    for (const preset of CREDENTIAL_TYPE_PRESETS) {
      const parsed = issueCredentialSchema.parse(body(preset));
      expect(parsed.type).toBe(preset);
    }
  });

  it('accepts a custom type and trims it', () => {
    const parsed = issueCredentialSchema.parse(body('  Award of Merit  '));
    expect(parsed.type).toBe('Award of Merit');
  });

  it('rejects an empty / too-short type', () => {
    expect(issueCredentialSchema.safeParse(body('')).success).toBe(false);
    expect(issueCredentialSchema.safeParse(body('a')).success).toBe(false);
  });

  it('rejects a type that does not start with a letter', () => {
    expect(issueCredentialSchema.safeParse(body('1stplace')).success).toBe(false);
    expect(issueCredentialSchema.safeParse(body('-leading')).success).toBe(false);
  });

  it('rejects illegal symbols', () => {
    expect(issueCredentialSchema.safeParse(body('award@merit')).success).toBe(false);
    expect(issueCredentialSchema.safeParse(body('a/b')).success).toBe(false);
    expect(issueCredentialSchema.safeParse(body('café crème')).success).toBe(false); // non-ASCII letters
  });

  it('rejects an over-long type (>40 after trim)', () => {
    expect(issueCredentialSchema.safeParse(body('a'.repeat(41))).success).toBe(false);
    expect(issueCredentialSchema.safeParse(body('a'.repeat(40))).success).toBe(true);
  });

  it('leaves the rest of the schema unchanged (a valid preset body round-trips)', () => {
    const parsed = issueCredentialSchema.parse(body('internship'));
    expect(parsed.recipientName).toBe('Asha Rao');
    expect(parsed.bodyParagraphs).toEqual(['did the thing.']);
    expect(parsed.password).toBe('a-strong-password'); // pragma: allowlist secret
  });
});
