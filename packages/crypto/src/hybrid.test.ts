import { computeCanonicalPayload } from '@dmjone/shared';
import { describe, expect, it } from 'vitest';
import { createHybridSigner } from './hybrid-signer.js';
import { sha256Hex } from './hash.js';
import { createSignatureVerifier } from './verifier.js';
import { buildSmallPdf, makeTestKeys, sampleContent } from './test-helpers.js';

describe('hybrid sign → verify round-trip', () => {
  it('delivers the rendered PDF as-is (no embedded signature) and the ML-DSA verifies', async () => {
    const { signing, verifying } = makeTestKeys();
    const content = sampleContent();
    const unsignedPdf = await buildSmallPdf();

    const signer = createHybridSigner(signing);
    const result = await signer.sign(unsignedPdf, (h) => computeCanonicalPayload(content, h));

    // The result fields follow the locked pipeline.
    expect(result.pdfSha256).toBe(sha256Hex(unsignedPdf));
    expect(result.pdfSha256).toBe(sha256Hex(result.signedPdf));
    expect(result.canonicalPayload).toBe(computeCanonicalPayload(content, result.pdfSha256));
    expect(result.canonicalSha256).toBe(sha256Hex(result.canonicalPayload));
    expect(result.mldsaSignature).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(result.mldsaPublicKeyId).toBe(signing.mldsaPublicKeyId);
    // No embedded cert anymore — the fingerprint field is intentionally empty.
    expect(result.padesCertFingerprint).toBe('');

    // The delivered bytes ARE the rendered bytes, verbatim.
    expect(Buffer.from(result.signedPdf).equals(Buffer.from(unsignedPdf))).toBe(true);

    // And there is NO PAdES signature dictionary in the delivered PDF.
    const pdfText = Buffer.from(result.signedPdf).toString('latin1');
    expect(pdfText).not.toContain('/ByteRange');

    const verifier = createSignatureVerifier(verifying);

    // ML-DSA verifies against the same content + pdf hash.
    expect(verifier.verifyMldsa(content, result.pdfSha256, result.mldsaSignature)).toBe(true);

    // Confirming the absence the structural way: the verifier sees no PAdES.
    const pades = await verifier.verifyPdfPades(result.signedPdf);
    expect(pades.present).toBe(false);
    expect(pades.intact).toBe(false);
  });

  it('produces a valid PDF the same size as the rendered input', async () => {
    const { signing } = makeTestKeys();
    const unsignedPdf = await buildSmallPdf();
    const content = sampleContent();
    const result = await createHybridSigner(signing).sign(
      unsignedPdf,
      (h) => computeCanonicalPayload(content, h),
    );

    const header = Buffer.from(result.signedPdf.subarray(0, 5)).toString('latin1');
    expect(header).toBe('%PDF-');
    // Delivered as-is: identical bytes, identical length (no appended signature).
    expect(result.signedPdf.length).toBe(unsignedPdf.length);
  });

  it('does NOT embed the ML-DSA signature into the PDF (it stays detached)', async () => {
    const { signing } = makeTestKeys();
    const content = sampleContent();
    const result = await createHybridSigner(signing).sign(
      await buildSmallPdf(),
      (h) => computeCanonicalPayload(content, h),
    );
    const pdfText = Buffer.from(result.signedPdf).toString('latin1');
    expect(pdfText).not.toContain(result.mldsaSignature);
    expect(pdfText).not.toContain(result.canonicalSha256);
  });
});

describe('1-bit tamper detection', () => {
  it('flipping one byte of the delivered PDF changes the recorded hash', async () => {
    const { signing } = makeTestKeys();
    const content = sampleContent();
    const result = await createHybridSigner(signing).sign(
      await buildSmallPdf(),
      (h) => computeCanonicalPayload(content, h),
    );

    const tampered = new Uint8Array(result.signedPdf);
    // Flip a byte well past the header.
    const idx = 60;
    tampered[idx] = (tampered[idx]! ^ 0xff) & 0xff;

    // The hash of the distributed bytes no longer matches the recorded one, so
    // upload-verify (file hash) will report TAMPERED — the document-integrity
    // guarantee now rests entirely on this recorded pdfSha256.
    expect(sha256Hex(tampered)).not.toBe(result.pdfSha256);
  });
});

describe('content-field tamper detection (ML-DSA)', () => {
  it('verifyMldsa fails when a content field is altered', async () => {
    const { signing, verifying } = makeTestKeys();
    const content = sampleContent();
    const result = await createHybridSigner(signing).sign(
      await buildSmallPdf(),
      (h) => computeCanonicalPayload(content, h),
    );
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
    const result = await createHybridSigner(signing).sign(
      await buildSmallPdf(),
      (h) => computeCanonicalPayload(content, h),
    );
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
