/**
 * `allocateCredentialId` — the generic per-day-sequence allocator that mints
 * `DMJ-<CODE>-YYYYMMDD-NN` for every document kind. These tests pin that it
 * works for ANY valid 2–4 letter prefix the caller derives (preset cert codes,
 * the kind prefixes LTR/DOC, and the codes a custom mode-1 type produces via
 * `credentialTypeCode`), shares one per-day sequence space, and rejects a
 * malformed prefix. The custom-code DERIVATION itself is unit-tested in the
 * `@dmjone/shared` suite (credential-type.test.ts); here we only feed the codes
 * it can emit and assert the assembled id is valid + sequenced.
 */

import { CREDENTIAL_ID_REGEX, ERROR_CODE } from '@dmjone/shared';
import type { CredentialRepository } from '@dmjone/shared';
import { describe, expect, it } from 'vitest';

import { allocateCredentialId } from '../src/issuance/credential-id.js';

/**
 * A minimal `CredentialRepository` exposing only `exists` (the single method the
 * allocator probes). Pre-seed `taken` to simulate already-issued ids. The other
 * methods throw — the allocator must never reach them.
 */
function fakeRepo(taken: Iterable<string> = []): CredentialRepository {
  const set = new Set(taken);
  const repo = {
    async exists(id: string): Promise<boolean> {
      return set.has(id);
    },
  } as Partial<CredentialRepository>;
  return repo as CredentialRepository;
}

const DATE = '2026-06-05'; // → 20260605

describe('allocateCredentialId — well-formed ids for any valid prefix', () => {
  it('allocates 01 for a fresh per-day sequence', async () => {
    expect(await allocateCredentialId(fakeRepo(), 'IC', DATE)).toBe('DMJ-IC-20260605-01');
  });

  it('produces ids matching CREDENTIAL_ID_REGEX for preset, kind, and custom-derived codes', async () => {
    // 'AOME' / 'BC' / 'CRT' are exactly what credentialTypeCode emits for custom
    // types; 'LTR'/'DOC' are the kind prefixes; 'IC' is a preset cert code.
    for (const code of ['IC', 'CC', 'LTR', 'DOC', 'AOME', 'BC', 'CRT']) {
      const id = await allocateCredentialId(fakeRepo(), code, DATE);
      expect(id).toBe(`DMJ-${code}-20260605-01`);
      expect(id).toMatch(CREDENTIAL_ID_REGEX);
    }
  });

  it('compacts the issue date into the id', async () => {
    expect(await allocateCredentialId(fakeRepo(), 'DOC', '2027-01-09')).toBe(
      'DMJ-DOC-20270109-01',
    );
  });
});

describe('allocateCredentialId — per-day sequencing', () => {
  it('probes upward to the next free slot', async () => {
    const repo = fakeRepo(['DMJ-IC-20260605-01', 'DMJ-IC-20260605-02']);
    expect(await allocateCredentialId(repo, 'IC', DATE)).toBe('DMJ-IC-20260605-03');
  });

  it('shares ONE sequence space across prefixes only per (prefix,date) — different prefixes are independent', async () => {
    // The sequence is per assembled id; LTR-01 being taken does not bump DOC.
    const repo = fakeRepo(['DMJ-LTR-20260605-01']);
    expect(await allocateCredentialId(repo, 'LTR', DATE)).toBe('DMJ-LTR-20260605-02');
    expect(await allocateCredentialId(repo, 'DOC', DATE)).toBe('DMJ-DOC-20260605-01');
  });

  it('throws CREDENTIAL_EXISTS (409) when all 99 daily slots are taken', async () => {
    const all: string[] = [];
    for (let n = 1; n <= 99; n += 1) {
      all.push(`DMJ-IC-20260605-${n.toString().padStart(2, '0')}`);
    }
    await expect(allocateCredentialId(fakeRepo(all), 'IC', DATE)).rejects.toMatchObject({
      code: ERROR_CODE.CREDENTIAL_EXISTS,
    });
  });
});

describe('allocateCredentialId — defence in depth', () => {
  it('rejects a malformed prefix with INTERNAL (500) before any id is minted', async () => {
    for (const bad of ['', 'A', 'TOOLONG', 'ic', 'A1', 'A-B']) {
      await expect(allocateCredentialId(fakeRepo(), bad, DATE)).rejects.toMatchObject({
        code: ERROR_CODE.INTERNAL,
      });
    }
  });
});
