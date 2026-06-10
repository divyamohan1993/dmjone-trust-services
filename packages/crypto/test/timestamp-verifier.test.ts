/**
 * RFC-3161 TimeStampToken verification.
 *
 * Tokens are hand-rolled in raw ASN.1 (see rfc3161-helpers) to match the real
 * structure FreeTSA/DigiCert emit — eContentType = id-ct-TSTInfo, signer
 * identified by issuerAndSerialNumber, embedded cert chain — precisely because
 * forge.pkcs7.messageFromAsn1 cannot parse that shape (it only accepts a `data`
 * SignedData). A forge-built token would let these tests pass while production
 * verification fails on every real token; building the token by hand is what
 * makes the suite meaningful.
 *
 * The verifier proves three things and NEVER throws:
 *   (a) signer messageDigest == SHA-256(TSTInfo), (b) auth-attrs RSA signature
 *   verifies, (c) messageImprint == SHA-256(data).
 */

import forge from 'node-forge';
import { describe, expect, it } from 'vitest';
import { verifyTimestampToken } from '../src/timestamp-verifier.js';
import { buildRealisticToken, makeTsaCert, type SignerDigest } from './rfc3161-helpers.js';

const DATA = new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);

describe('verifyTimestampToken — valid token', () => {
  it('verifies a realistic token over the right data, with genTime + subject', () => {
    const { tokenB64 } = buildRealisticToken({ data: DATA, genTime: '20260609120000Z' });

    const res = verifyTimestampToken(tokenB64, DATA);

    expect(res.valid).toBe(true);
    // GeneralizedTime "20260609120000Z" → ISO.
    expect(res.genTime).toBe('2026-06-09T12:00:00.000Z');
    expect(res.tsaSubject).toContain('CN=dmj.one Test TSA');
    expect(res.tsaSubject).toContain('C=IN');
  });

  it('parses a fractional-second genTime', () => {
    const { tokenB64 } = buildRealisticToken({ data: DATA, genTime: '20260609120000.500Z' });
    const res = verifyTimestampToken(tokenB64, DATA);
    expect(res.valid).toBe(true);
    expect(res.genTime).toBe('2026-06-09T12:00:00.500Z');
  });

  it('selects the signer cert by trial-verification when a chain is embedded', () => {
    // A decoy cert precedes the signer in the chain (certReq=TRUE ⇒ multi-cert
    // is the real-world case). Position-based or first-cert selection would pick
    // the decoy and fail; trial-verification finds the cert whose key actually
    // verifies the auth-attrs signature and reports ITS subject.
    const { tokenB64 } = buildRealisticToken({ data: DATA, withDecoyCert: true });
    const res = verifyTimestampToken(tokenB64, DATA);
    expect(res.valid).toBe(true);
    expect(res.tsaSubject).toContain('CN=dmj.one Test TSA');
    expect(res.tsaSubject).not.toContain('Decoy');
  });

  it('verifies a signer cert with a high-bit serial (DER leading 0x00) — encoding-agnostic', () => {
    // A serial with the top bit set is DER-encoded with a leading 0x00 octet;
    // forge's cert.serialNumber hex typically omits it. The old issuer+serial
    // matcher would mismatch and fail; trial-verification is immune to it.
    const signer = makeTsaCert('dmj.one HighBit TSA', '00f1e2d3c4b5a697');
    const { tokenB64 } = buildRealisticToken({ data: DATA, signer, withDecoyCert: true });
    const res = verifyTimestampToken(tokenB64, DATA);
    expect(res.valid).toBe(true);
    expect(res.tsaSubject).toContain('CN=dmj.one HighBit TSA');
  });

  // Real RSA TSAs sign with different SHA-2 digests (DigiCert SHA-256, Sectigo
  // SHA-384). The verifier reads the signer digest from the token and applies it
  // to BOTH the messageDigest attr and the signature — proven live against those
  // endpoints; these keep the digest-agility green without a network.
  it.each<SignerDigest>(['sha256', 'sha384', 'sha512'])(
    'verifies an RSA token signed with %s (digest read from the token)',
    (signerDigest) => {
      const { tokenB64 } = buildRealisticToken({ data: DATA, signerDigest });
      const res = verifyTimestampToken(tokenB64, DATA);
      expect(res.valid).toBe(true);
      // Wrong data still fails regardless of the signing digest.
      expect(verifyTimestampToken(tokenB64, new Uint8Array([0])).valid).toBe(false);
    },
  );
});

describe('verifyTimestampToken — rejects tampering (never throws)', () => {
  it('invalid when the data does not match the timestamped imprint', () => {
    const { tokenB64 } = buildRealisticToken({ data: DATA });
    const wrong = new Uint8Array([1, 1, 1, 1]);
    const res = verifyTimestampToken(tokenB64, wrong);
    expect(res.valid).toBe(false);
  });

  it('invalid when the imprint inside the token is forged (signature still over TSTInfo)', () => {
    // messageImprint ≠ SHA-256(data), but the auth-attrs are still correctly
    // signed over the (tampered) TSTInfo — check (c) must catch this.
    const { tokenB64 } = buildRealisticToken({ data: DATA, wrongImprint: true });
    const res = verifyTimestampToken(tokenB64, DATA);
    expect(res.valid).toBe(false);
  });

  it('invalid when the auth-attrs signature is from a different key', () => {
    // Build a token, then re-sign nothing: instead, swap the embedded cert for a
    // foreign one so the RSA signature no longer verifies under the (wrong) key.
    const { tokenAsn1 } = buildRealisticToken({ data: DATA });
    const foreign = makeTsaCert('Foreign TSA');
    // ContentInfo → [0] → SignedData → certificates [0] context tag.
    const sd = ((tokenAsn1.value as forge.asn1.Asn1[])[1]!.value as forge.asn1.Asn1[])[0]!;
    const sdChildren = sd.value as forge.asn1.Asn1[];
    const certCtx = sdChildren.find(
      (c) => c.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && c.type === 0,
    )!;
    (certCtx.value as forge.asn1.Asn1[])[0] = forge.pki.certificateToAsn1(foreign.cert);
    const tampered = Buffer.from(forge.asn1.toDer(tokenAsn1).getBytes(), 'latin1').toString('base64');

    const res = verifyTimestampToken(tampered, DATA);
    expect(res.valid).toBe(false);
  });

  it('invalid (not a throw) on a structurally broken token (truncated DER)', () => {
    const { tokenB64 } = buildRealisticToken({ data: DATA });
    // Truncating the DER breaks the ASN.1 length framing → parse fails. The
    // verifier must absorb that as { valid:false }, never throw. (A single benign
    // byte-flip elsewhere need NOT invalidate — only the imprint / signed attrs /
    // signature / eContent are load-bearing, and those are covered above.)
    const raw = Buffer.from(tokenB64, 'base64');
    const truncated = raw.subarray(0, Math.floor(raw.length / 2)).toString('base64');
    const res = verifyTimestampToken(truncated, DATA);
    expect(res.valid).toBe(false);
  });

  it('flipping any single byte never throws (returns a result either way)', () => {
    const { tokenB64 } = buildRealisticToken({ data: DATA });
    const raw = Buffer.from(tokenB64, 'base64');
    // Sample a spread of offsets; each must yield a boolean `valid`, never throw.
    for (const off of [0, 5, 40, Math.floor(raw.length / 2), raw.length - 1]) {
      const m = Buffer.from(raw);
      m[off] = m[off]! ^ 0xff;
      const res = verifyTimestampToken(m.toString('base64'), DATA);
      expect(typeof res.valid).toBe('boolean');
    }
  });

  it('invalid (not a throw) on malformed base64', () => {
    expect(verifyTimestampToken('not-base64-!!!@@@', DATA)).toEqual({ valid: false });
  });

  it('invalid (not a throw) on an empty string', () => {
    expect(verifyTimestampToken('', DATA)).toEqual({ valid: false });
  });

  it('invalid (not a throw) on an unsupported signer digest (e.g. SHA-1)', () => {
    // The verifier supports RSA + SHA-2 only; an unsupported signer digest must
    // be rejected cleanly, not throw. Swap the signerInfo digestAlgorithm OID to
    // SHA-1 in a built token. (ECDSA TSAs like FreeTSA fall into this same
    // "unsupported → invalid" bucket; documented on env.TSA_URL.)
    const { tokenAsn1 } = buildRealisticToken({ data: DATA });
    const { asn1 } = forge;
    const SHA1_OID = '1.3.14.3.2.26';
    const sd = ((tokenAsn1.value as forge.asn1.Asn1[])[1]!.value as forge.asn1.Asn1[])[0]!;
    const sdChildren = sd.value as forge.asn1.Asn1[];
    const siSet = [...sdChildren]
      .reverse()
      .find((c) => c.tagClass === asn1.Class.UNIVERSAL && c.type === asn1.Type.SET)!;
    const si = (siSet.value as forge.asn1.Asn1[])[0]!.value as forge.asn1.Asn1[];
    const authIdx = si.findIndex((c) => c.tagClass === asn1.Class.CONTEXT_SPECIFIC && c.type === 0);
    const digestAlg = si[authIdx - 1]!;
    const oidNode = (digestAlg.value as forge.asn1.Asn1[]).find(
      (c) => c.tagClass === asn1.Class.UNIVERSAL && c.type === asn1.Type.OID,
    )!;
    oidNode.value = asn1.oidToDer(SHA1_OID).getBytes();
    const tampered = Buffer.from(asn1.toDer(tokenAsn1).getBytes(), 'latin1').toString('base64');

    expect(verifyTimestampToken(tampered, DATA).valid).toBe(false);
  });

  it('invalid on a non-timestamp PKCS#7 / arbitrary DER', () => {
    // A SignedData-looking ContentInfo with eContentType = data (not TSTInfo).
    const { asn1 } = forge;
    const junk = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer('1.2.840.113549.1.7.1').getBytes()),
    ]);
    const b64 = Buffer.from(asn1.toDer(junk).getBytes(), 'latin1').toString('base64');
    expect(verifyTimestampToken(b64, DATA).valid).toBe(false);
  });
});
