/**
 * RFC-3161 timestamping (PAdES-B-T).
 *
 * The critical safety property: adding the unsigned timeStampToken attribute
 * does NOT change the signature bytes — so it can never invalidate the PAdES
 * signature. Plus the request/parse logic is best-effort (any failure → null).
 */

import { Buffer } from 'node:buffer';
import forge from 'node-forge';
import { describe, expect, it } from 'vitest';
import { generateSelfSignedPadesCert } from '../src/keys.js';
import { ForgePadesSigner } from '../src/pades-signer.js';
import { requestTimestampToken, signerInfoSignature } from '../src/tsa.js';
import { verifyTimestampToken } from '../src/timestamp-verifier.js';
import { buildRealisticToken } from './rfc3161-helpers.js';

const ID_AA_TIME_STAMP_TOKEN = '1.2.840.113549.1.9.16.2.14';

/** A minimal-but-valid RFC-3161 TimeStampResp (status granted + a token). */
function mockTimeStampResp(): Uint8Array {
  const { asn1 } = forge;
  const token = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer('1.2.840.113549.1.7.2').getBytes()),
    asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, 'token'),
    ]),
  ]);
  const resp = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, asn1.integerToDer(0).getBytes()),
    ]),
    token,
  ]);
  return new Uint8Array(Buffer.from(asn1.toDer(resp).getBytes(), 'latin1'));
}

const okFetch = (async () => ({
  ok: true,
  arrayBuffer: async () => {
    const u = mockTimeStampResp();
    return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength);
  },
})) as unknown as typeof fetch;

const fromDer = (der: Buffer): forge.asn1.Asn1 =>
  forge.asn1.fromDer(forge.util.createBuffer(der.toString('latin1')));

function hasTimestampOid(der: Buffer): boolean {
  // The id-aa-timeStampToken OID DER bytes must appear in the SignerInfo attrs.
  const oidDer = forge.asn1.oidToDer(ID_AA_TIME_STAMP_TOKEN).getBytes();
  return der.toString('latin1').includes(oidDer);
}

describe('requestTimestampToken (best-effort)', () => {
  it('returns a token on a granted response', async () => {
    const token = await requestTimestampToken(new Uint8Array([1, 2, 3]), {
      url: 'http://tsa.test',
      fetchImpl: okFetch,
    });
    expect(token).not.toBeNull();
  });

  it('returns null on a non-ok HTTP response', async () => {
    const bad = (async () => ({ ok: false })) as unknown as typeof fetch;
    expect(await requestTimestampToken(new Uint8Array([1]), { url: 'x', fetchImpl: bad })).toBeNull();
  });

  it('returns null when the TSA throws / times out', async () => {
    const boom = (async () => {
      throw new Error('network');
    }) as unknown as typeof fetch;
    expect(await requestTimestampToken(new Uint8Array([1]), { url: 'x', fetchImpl: boom })).toBeNull();
  });

  it('returns null on a rejected PKIStatus', async () => {
    const rejected = (async () => ({
      ok: true,
      arrayBuffer: async () => {
        const { asn1 } = forge;
        const resp = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
          asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
            asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, asn1.integerToDer(2).getBytes()),
          ]),
        ]);
        const u = new Uint8Array(Buffer.from(asn1.toDer(resp).getBytes(), 'latin1'));
        return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength);
      },
    })) as unknown as typeof fetch;
    expect(await requestTimestampToken(new Uint8Array([1]), { url: 'x', fetchImpl: rejected })).toBeNull();
  });
});

describe('PAdES-B-T injection is signature-preserving', () => {
  it('adds the timeStampToken attr WITHOUT changing the signature bytes', async () => {
    const pades = generateSelfSignedPadesCert();
    const at = new Date('2026-01-01T00:00:00.000Z');
    const data = Buffer.from('the bytes @signpdf would hand us');

    const plain = await new ForgePadesSigner(pades.certPem, pades.keyPem).sign(data, at);
    const stamped = await new ForgePadesSigner(pades.certPem, pades.keyPem, {
      url: 'http://tsa.test',
      fetchImpl: okFetch,
    }).sign(data, at);

    // The timestamp appears only in the stamped one.
    expect(hasTimestampOid(plain)).toBe(false);
    expect(hasTimestampOid(stamped)).toBe(true);
    expect(stamped.length).toBeGreaterThan(plain.length);

    // ...and the signature value is byte-identical (the attr is unsigned).
    const sigPlain = signerInfoSignature(fromDer(plain));
    const sigStamped = signerInfoSignature(fromDer(stamped));
    expect(sigStamped).not.toBeNull();
    expect(Buffer.from(sigStamped!).equals(Buffer.from(sigPlain!))).toBe(true);
  });

  it('falls back to an un-timestamped signature when the TSA fails', async () => {
    const pades = generateSelfSignedPadesCert();
    const boom = (async () => {
      throw new Error('tsa down');
    }) as unknown as typeof fetch;
    const der = await new ForgePadesSigner(pades.certPem, pades.keyPem, {
      url: 'x',
      fetchImpl: boom,
    }).sign(Buffer.from('data'));
    // Still a valid, parseable PKCS#7 — just no timestamp.
    expect(hasTimestampOid(der)).toBe(false);
    expect(signerInfoSignature(fromDer(der))).not.toBeNull();
  });
});

describe('request → serialize → verify round-trip (the real signer/verifier seam)', () => {
  // A TSA mock whose granted response embeds a REALISTIC token over `data`.
  const tsaReturning = (data: Uint8Array): typeof fetch =>
    (async () => {
      const { asn1 } = forge;
      const { tokenAsn1 } = buildRealisticToken({ data, genTime: '20260609123456Z' });
      const resp = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
        // PKIStatusInfo { status = granted (0) }.
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
          asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, asn1.integerToDer(0).getBytes()),
        ]),
        tokenAsn1, // timeStampToken ContentInfo
      ]);
      const u = new Uint8Array(Buffer.from(asn1.toDer(resp).getBytes(), 'latin1'));
      return {
        ok: true,
        arrayBuffer: async () => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength),
      };
    }) as unknown as typeof fetch;

  it('serializes the requested token exactly as the signer does, and verifies it', async () => {
    const data = new Uint8Array([42, 7, 13, 99, 1, 250]);

    // 1. Request the token (what createHybridSigner does over the raw ML-DSA sig).
    const token = await requestTimestampToken(data, { url: 'http://tsa.test', fetchImpl: tsaReturning(data) });
    expect(token).not.toBeNull();

    // 2. Serialize to base64 DER exactly as createHybridSigner stores it.
    const tokenB64 = Buffer.from(forge.asn1.toDer(token!).getBytes(), 'latin1').toString('base64');

    // 3. Verify (what the verify service does with base64ToBytes(mldsaSignature)).
    const res = verifyTimestampToken(tokenB64, data);
    expect(res.valid).toBe(true);
    expect(res.genTime).toBe('2026-06-09T12:34:56.000Z');

    // The imprint is bound to THESE bytes: other data must not verify.
    expect(verifyTimestampToken(tokenB64, new Uint8Array([0, 0, 0])).valid).toBe(false);
  });
});
