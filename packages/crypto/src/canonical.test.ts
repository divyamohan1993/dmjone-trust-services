/**
 * Determinism guarantees for the SHARED canonical payload, exercised from the
 * crypto package (sign + verify both depend on byte-identical output). We never
 * reimplement canonicalization here — we only assert the contract holds.
 */

import { computeCanonicalPayload } from '@dmjone/shared';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from './hash.js';
import { sampleContent } from './test-helpers.js';

const PDF_HASH = sha256Hex('the-final-signed-pdf');

describe('computeCanonicalPayload determinism', () => {
  it('is stable across repeated calls for identical input', () => {
    const content = sampleContent();
    expect(computeCanonicalPayload(content, PDF_HASH)).toBe(
      computeCanonicalPayload(content, PDF_HASH),
    );
  });

  it('is independent of object key insertion order', () => {
    const a = sampleContent();
    // Rebuild with keys in a different insertion order.
    const b = sampleContent({
      signatory: { phone: a.signatory.phone, role: a.signatory.role, name: a.signatory.name },
    });
    expect(computeCanonicalPayload(b, PDF_HASH)).toBe(computeCanonicalPayload(a, PDF_HASH));
  });

  it('changes when any signed field changes', () => {
    const base = sampleContent();
    const baseline = computeCanonicalPayload(base, PDF_HASH);

    expect(computeCanonicalPayload({ ...base, recipientName: 'Someone Else' }, PDF_HASH)).not.toBe(
      baseline,
    );
    expect(computeCanonicalPayload(base, sha256Hex('different-pdf'))).not.toBe(baseline);
    expect(
      computeCanonicalPayload({ ...base, bodyParagraphs: [...base.bodyParagraphs, 'extra'] }, PDF_HASH),
    ).not.toBe(baseline);
  });

  it('treats a missing closingLine as the empty string', () => {
    // Omit closingLine entirely (exactOptionalPropertyTypes forbids passing undefined).
    const { closingLine: _omit, ...withoutClosing } = sampleContent();
    void _omit;
    const withEmpty = sampleContent({ closingLine: '' });
    expect(computeCanonicalPayload(withoutClosing, PDF_HASH)).toBe(
      computeCanonicalPayload(withEmpty, PDF_HASH),
    );
  });
});
