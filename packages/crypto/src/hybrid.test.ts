import { computeCanonicalPayload } from '@dmjone/shared';
import { describe, expect, it } from 'vitest';
import { createHybridSigner } from './hybrid-signer.js';
import { sha256Hex } from './hash.js';
import { createSignatureVerifier } from './verifier.js';
import { buildSmallPdf, makeTestKeys, sampleContent } from './test-helpers.js';

describe('hybrid sign → verify round-trip', () => {
  it('signs a real PDF and verifies both ML-DSA and PAdES', async () => {
    const { signing, verifying } = makeTestKeys();
    const content = sampleContent();
    const unsignedPdf = await buildSmallPdf();

    const signer = createHybridSigner(signing);
    const result = await signer.sign(unsignedPdf, content);

    // The result fields follow the locked pipeline.
    expect(result.pdfSha256).toBe(sha256Hex(result.signedPdf));
    expect(result.canonicalPayload).toBe(computeCanonicalPayload(content, result.pdfSha256));
    expect(result.canonicalSha256).toBe(sha256Hex(result.canonicalPayload));
    expect(result.mldsaSignature).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(result.mldsaPublicKeyId).toBe(signing.mldsaPublicKeyId);
    expect(result.padesCertFingerprint).toMatch(/^[0-9a-f]{64}$/);

    const verifier = createSignatureVerifier(verifying);

    // ML-DSA verifies against the same content + pdf hash.
    expect(verifier.verifyMldsa(content, result.pdfSha256, result.mldsaSignature)).toBe(true);

    // PAdES is present and intact, signed by our identity.
    const pades = await verifier.verifyPdfPades(result.signedPdf);
    expect(pades.present).toBe(true);
    expect(pades.intact).toBe(true);
    expect(pades.certFingerprint).toBe(result.padesCertFingerprint);
    expect(pades.signerSubject).toContain('CN=dmj.one Trust Services');
    expect(pades.signerSubject).toContain('OU=Document Signing');
  });

  it('produces a signed PDF that is a valid PDF and larger than the input', async () => {
    const { signing } = makeTestKeys();
    const unsignedPdf = await buildSmallPdf();
    const result = await createHybridSigner(signing).sign(unsignedPdf, sampleContent());

    const header = Buffer.from(result.signedPdf.subarray(0, 5)).toString('latin1');
    expect(header).toBe('%PDF-');
    expect(result.signedPdf.length).toBeGreaterThan(unsignedPdf.length);
  });

  it('preserves the original (rendered) PDF bytes verbatim as a prefix', async () => {
    // Incremental-update signing appends to the end and never rewrites the
    // original bytes — this is what keeps the Chromium output pixel-faithful.
    const { signing } = makeTestKeys();
    const unsignedPdf = await buildSmallPdf();
    const result = await createHybridSigner(signing).sign(unsignedPdf, sampleContent());

    const prefix = result.signedPdf.subarray(0, unsignedPdf.length);
    expect(Buffer.from(prefix).equals(Buffer.from(unsignedPdf))).toBe(true);
  });

  it('does NOT embed the ML-DSA signature into the PDF (it stays detached)', async () => {
    const { signing } = makeTestKeys();
    const result = await createHybridSigner(signing).sign(await buildSmallPdf(), sampleContent());
    const pdfText = Buffer.from(result.signedPdf).toString('latin1');
    expect(pdfText).not.toContain(result.mldsaSignature);
    expect(pdfText).not.toContain(result.canonicalSha256);
  });
});

describe('1-bit tamper detection', () => {
  it('flipping one byte of the signed PDF changes the hash and breaks PAdES intactness', async () => {
    const { signing, verifying } = makeTestKeys();
    const result = await createHybridSigner(signing).sign(await buildSmallPdf(), sampleContent());

    const tampered = new Uint8Array(result.signedPdf);
    // Flip a byte inside the first ByteRange segment (well past the header).
    const idx = 60;
    tampered[idx] = (tampered[idx]! ^ 0xff) & 0xff;

    // The hash of the distributed bytes no longer matches the recorded one.
    expect(sha256Hex(tampered)).not.toBe(result.pdfSha256);

    // And the embedded PAdES signature is no longer intact.
    const pades = await createSignatureVerifier(verifying).verifyPdfPades(tampered);
    expect(pades.present).toBe(true);
    expect(pades.intact).toBe(false);
  });
});

describe('content-field tamper detection (ML-DSA)', () => {
  it('verifyMldsa fails when a content field is altered', async () => {
    const { signing, verifying } = makeTestKeys();
    const content = sampleContent();
    const result = await createHybridSigner(signing).sign(await buildSmallPdf(), content);
    const verifier = createSignatureVerifier(verifying);

    // Genuine content passes.
    expect(verifier.verifyMldsa(content, result.pdfSha256, result.mldsaSignature)).toBe(true);

    // Tamper the recipient name → signature must fail.
    const tampered = { ...content, recipientName: 'Mallory Imposter' };
    expect(verifier.verifyMldsa(tampered, result.pdfSha256, result.mldsaSignature)).toBe(false);

    // Tamper the pdf hash → signature must fail.
    expect(
      verifier.verifyMldsa(content, sha256Hex('different-pdf'), result.mldsaSignature),
    ).toBe(false);
  });

  it('verifyMldsa returns false (never throws) on a malformed signature', async () => {
    const { signing, verifying } = makeTestKeys();
    const content = sampleContent();
    const result = await createHybridSigner(signing).sign(await buildSmallPdf(), content);
    const verifier = createSignatureVerifier(verifying);

    expect(verifier.verifyMldsa(content, result.pdfSha256, 'not-base64-!!!')).toBe(false);
    expect(verifier.verifyMldsa(content, result.pdfSha256, '')).toBe(false);
  });

  it('verifyPdfPades reports not-present for a PDF without a signature', async () => {
    const { verifying } = makeTestKeys();
    const plain = await buildSmallPdf('unsigned');
    const pades = await createSignatureVerifier(verifying).verifyPdfPades(plain);
    expect(pades.present).toBe(false);
    expect(pades.intact).toBe(false);
  });
});
