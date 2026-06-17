/**
 * Catalog lint for DOC_TEMPLATES — the build-time guard that no shipped
 * template can carry a half-truth about WHO dmj.one is or WHAT it claims.
 *
 * The catalog is data only (it populates the existing CredentialContent /
 * LetterContent fields), so the lint is the safety net: every denylist-scanned
 * text field of every entry must pass {@link findDenylistedTerm}, with the
 * internship-group entries additionally scanned for employment/payment terms.
 *
 * This test is the oracle the authoring relies on — it is intentionally
 * exhaustive (every entry, every scanned field) so a slip in prose fails here
 * rather than reaching an issued, signed document.
 */
import { describe, it, expect } from 'vitest';
import { DOC_TEMPLATES, type DocTemplate } from '../src/doc-templates.js';
import { findDenylistedTerm } from '../src/content-guards.js';

/**
 * Internship-group entries (#1 offer, #2 completion cert, #3 LOR) must contain
 * no employment/payment language. The group is derived from the id prefix so
 * the test cannot drift out of sync with the catalog.
 */
function isInternshipGroup(t: DocTemplate): boolean {
  return t.id.startsWith('internship-');
}

/** The denylist-scanned text fields of an entry (excludes recipient identity). */
function scannedFields(t: DocTemplate): string[] {
  if (t.cert) {
    return [
      t.cert.kicker,
      t.cert.title,
      t.cert.intro,
      ...t.cert.bodyParagraphs,
      t.cert.closingLine,
    ].filter((s): s is string => typeof s === 'string');
  }
  if (t.letter) {
    return [
      t.letter.reference,
      t.letter.subject,
      t.letter.salutation,
      t.letter.valediction,
      ...t.letter.bodyParagraphs,
    ].filter((s): s is string => typeof s === 'string');
  }
  return [];
}

describe('DOC_TEMPLATES catalog', () => {
  it('has exactly 9 entries', () => {
    expect(DOC_TEMPLATES).toHaveLength(9);
  });

  it('has unique, kebab-case, non-empty ids', () => {
    const ids = DOC_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });

  it('has a non-empty label for every entry', () => {
    for (const t of DOC_TEMPLATES) {
      expect(t.label.trim().length).toBeGreaterThan(0);
    }
  });

  it('sets exactly one of cert/letter, matching kind', () => {
    for (const t of DOC_TEMPLATES) {
      if (t.kind === 'certificate') {
        expect(t.cert, t.id).toBeDefined();
        expect(t.letter, t.id).toBeUndefined();
      } else if (t.kind === 'letter') {
        expect(t.letter, t.id).toBeDefined();
        expect(t.cert, t.id).toBeUndefined();
      } else {
        throw new Error(`${t.id}: unexpected kind ${t.kind}`);
      }
    }
  });

  it('exactly 7 (the convention-extended types) carry the lawyer-review suffix', () => {
    const flagged = DOC_TEMPLATES.filter((t) => t.label.endsWith('(lawyer-review)'));
    expect(flagged).toHaveLength(7);
    // The two directly-sourced types (#2 completion cert, #9 association letter) are NOT flagged.
    expect(DOC_TEMPLATES.find((t) => t.id === 'internship-completion-cert')!.label)
      .not.toContain('lawyer-review');
    expect(DOC_TEMPLATES.find((t) => t.id === 'association-verification-letter')!.label)
      .not.toContain('lawyer-review');
  });

  it('every denylist-scanned field is clean (internship group scanned for employment terms)', () => {
    for (const t of DOC_TEMPLATES) {
      const internship = isInternshipGroup(t);
      for (const field of scannedFields(t)) {
        const hit = findDenylistedTerm(field, { internship });
        expect(hit, `${t.id} → "${field}"`).toBeNull();
      }
    }
  });

  it('internship-group entries contain no employment/payment terms', () => {
    // Redundant with the scan above (which passes {internship:true} for these),
    // asserted explicitly so the intent is on record and a regrouping is caught.
    const group = DOC_TEMPLATES.filter(isInternshipGroup);
    expect(group.map((t) => t.id).sort()).toEqual(
      ['internship-completion-cert', 'internship-offer-letter', 'internship-recommendation-letter'].sort(),
    );
    for (const t of group) {
      for (const field of scannedFields(t)) {
        expect(findDenylistedTerm(field, { internship: true }), `${t.id} → "${field}"`).toBeNull();
      }
    }
  });

  it('every cert entry carries a usable content shape; every letter entry a usable body', () => {
    for (const t of DOC_TEMPLATES) {
      if (t.cert) {
        expect(t.cert.kicker.length, t.id).toBeGreaterThan(0);
        expect(t.cert.title.length, t.id).toBeGreaterThan(0);
        expect(t.cert.intro.length, t.id).toBeGreaterThan(0);
        expect(t.cert.bodyParagraphs.length, t.id).toBeGreaterThan(0);
      }
      if (t.letter) {
        expect(t.letter.bodyParagraphs.length, t.id).toBeGreaterThan(0);
      }
    }
  });
});
