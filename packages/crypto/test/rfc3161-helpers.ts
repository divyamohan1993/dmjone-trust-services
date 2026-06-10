/**
 * Test-only RFC-3161 token construction.
 *
 * Builds a REALISTIC timeStampToken in raw ASN.1 — eContentType =
 * id-ct-TSTInfo, eContent = OCTET STRING wrapping a TSTInfo DER, signer
 * identified by issuerAndSerialNumber, with the signer cert (chain) embedded.
 * Deliberately NOT built via forge.pkcs7.createSignedData(), which can only emit
 * a `data`-typed SignedData and so would let a forge-vs-forge test pass green
 * while production verification (which hand-walks the ASN.1) fails on real tokens.
 *
 * Used by the verifier unit tests and by the e2e test's mock TSA response so the
 * verifier is exercised against the exact structure FreeTSA/DigiCert emit.
 */

import forge from 'node-forge';

const { asn1, pki, md, util } = forge;

const SHA256_OID = '2.16.840.1.101.3.4.2.1';
const SHA384_OID = '2.16.840.1.101.3.4.2.2';
const SHA512_OID = '2.16.840.1.101.3.4.2.3';
const ID_SIGNED_DATA = '1.2.840.113549.1.7.2';
const ID_CT_TSTINFO = '1.2.840.113549.1.9.16.1.4';
const ID_CONTENT_TYPE = '1.2.840.113549.1.9.3';
const ID_MESSAGE_DIGEST = '1.2.840.113549.1.9.4';
const RSA_SHA256 = '1.2.840.113549.1.1.11';
const RSA_SHA384 = '1.2.840.113549.1.1.12';
const RSA_SHA512 = '1.2.840.113549.1.1.13';

export type SignerDigest = 'sha256' | 'sha384' | 'sha512';

const DIGEST_OID: Record<SignerDigest, string> = {
  sha256: SHA256_OID,
  sha384: SHA384_OID,
  sha512: SHA512_OID,
};
const RSA_WITH_DIGEST_OID: Record<SignerDigest, string> = {
  sha256: RSA_SHA256,
  sha384: RSA_SHA384,
  sha512: RSA_SHA512,
};
const mdFor = (d: SignerDigest): forge.md.MessageDigest =>
  d === 'sha384' ? md.sha384.create() : d === 'sha512' ? md.sha512.create() : md.sha256.create();

export interface MockTsaCert {
  certPem: string;
  privateKey: forge.pki.rsa.PrivateKey;
  cert: forge.pki.Certificate;
}

/** A self-signed RSA-2048 "TSA" cert (small bits → fast tests). */
export function makeTsaCert(commonName = 'dmj.one Test TSA', serialNumber = '0123456789abcdef'): MockTsaCert {
  const keypair = pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const cert = pki.createCertificate();
  cert.publicKey = keypair.publicKey;
  cert.serialNumber = serialNumber;
  cert.validity.notBefore = new Date('2026-01-01T00:00:00Z');
  cert.validity.notAfter = new Date('2030-01-01T00:00:00Z');
  const subject = [
    { name: 'commonName', value: commonName },
    { name: 'organizationalUnitName', value: 'Timestamping' },
    { name: 'countryName', value: 'IN' },
  ];
  cert.setSubject(subject);
  cert.setIssuer(subject);
  cert.sign(keypair.privateKey, md.sha256.create());
  return { certPem: pki.certificateToPem(cert), privateKey: keypair.privateKey, cert };
}

const bin = (b: Uint8Array): string => Buffer.from(b).toString('latin1');
const sha256Bin = (binStr: string): string => md.sha256.create().update(binStr).digest().getBytes();

const algId = (oid: string): forge.asn1.Asn1 =>
  asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(oid).getBytes()),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, ''),
  ]);

export interface BuildTokenOpts {
  /** The bytes the token timestamps; messageImprint = SHA-256(data). */
  data: Uint8Array;
  signer?: MockTsaCert;
  /** GeneralizedTime, e.g. "20260609120000Z". */
  genTime?: string;
  /** Force the messageImprint to a wrong value (forging-resistance test). */
  wrongImprint?: boolean;
  /** Embed an extra (decoy) cert before the signer, to exercise chain selection. */
  withDecoyCert?: boolean;
  /** The TSA's signing digest (messageDigest attr + signature). Default sha256.
   *  Real RSA TSAs vary this (DigiCert sha256, Sectigo sha384). The imprint
   *  inside TSTInfo stays sha256 regardless (it echoes our request). */
  signerDigest?: SignerDigest;
}

/**
 * Build a TSTInfo (DER binary string) over messageImprint = SHA-256(data).
 */
function buildTstInfo(data: Uint8Array, genTime: string, wrongImprint: boolean): string {
  const imprint = wrongImprint ? sha256Bin('completely different bytes') : sha256Bin(bin(data));
  const tstInfo = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, asn1.integerToDer(1).getBytes()),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer('1.3.6.1.4.1.13762.3').getBytes()),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
      algId(SHA256_OID),
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, imprint),
    ]),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, asn1.integerToDer(42).getBytes()),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.GENERALIZEDTIME, false, genTime),
  ]);
  return asn1.toDer(tstInfo).getBytes();
}

/**
 * Build a complete, realistic RFC-3161 timeStampToken (ContentInfo) as an ASN.1
 * object. Returns the asn1 tree (ready to `toDer`) plus its base64 DER.
 */
export function buildRealisticToken(opts: BuildTokenOpts): {
  tokenAsn1: forge.asn1.Asn1;
  tokenB64: string;
  genTime: string;
} {
  const signer = opts.signer ?? makeTsaCert();
  const genTime = opts.genTime ?? '20260609120000Z';
  const digest = opts.signerDigest ?? 'sha256';
  const tstInfoDer = buildTstInfo(opts.data, genTime, opts.wrongImprint ?? false);

  // authenticatedAttributes: contentType=id-ct-TSTInfo, messageDigest=digest(TSTInfo).
  const attr = (oid: string, valueAsn1: forge.asn1.Asn1): forge.asn1.Asn1 =>
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(oid).getBytes()),
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, [valueAsn1]),
    ]);
  const tstInfoDigest = mdFor(digest).update(tstInfoDer).digest().getBytes();
  const attrsArray = [
    attr(
      ID_CONTENT_TYPE,
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(ID_CT_TSTINFO).getBytes()),
    ),
    attr(
      ID_MESSAGE_DIGEST,
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, tstInfoDigest),
    ),
  ];

  // Signature is over the explicit SET OF (0x31), then stored context-tagged [0].
  const attrSetDer = asn1.toDer(
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, attrsArray),
  ).getBytes();
  const signature = signer.privateKey.sign(mdFor(digest).update(attrSetDer));
  const signedAttrsCtx = asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, attrsArray);

  const issuerAndSerial = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    pki.distinguishedNameToAsn1(signer.cert.issuer),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, util.hexToBytes(signer.cert.serialNumber)),
  ]);

  const signerInfo = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, asn1.integerToDer(1).getBytes()),
    issuerAndSerial,
    algId(DIGEST_OID[digest]),
    signedAttrsCtx,
    algId(RSA_WITH_DIGEST_OID[digest]),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, signature),
  ]);

  const encapContentInfo = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(ID_CT_TSTINFO).getBytes()),
    asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, tstInfoDer),
    ]),
  ]);

  // Optionally prepend a decoy cert (different issuer+serial) to verify the
  // verifier matches the signer by issuerAndSerialNumber, not by position.
  const certNodes = [pki.certificateToAsn1(signer.cert)];
  if (opts.withDecoyCert) {
    const decoy = makeTsaCert('Decoy CA');
    decoy.cert.serialNumber = 'deadbeefdeadbeef';
    certNodes.unshift(pki.certificateToAsn1(decoy.cert));
  }
  const certCtx = asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, certNodes);

  const signedData = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, asn1.integerToDer(3).getBytes()),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, [algId(DIGEST_OID[digest])]),
    encapContentInfo,
    certCtx,
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, [signerInfo]),
  ]);

  const contentInfo = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(ID_SIGNED_DATA).getBytes()),
    asn1.create(asn1.Class.CONTEXT_SPECIFIC, 0, true, [signedData]),
  ]);

  const tokenB64 = Buffer.from(asn1.toDer(contentInfo).getBytes(), 'latin1').toString('base64');
  return { tokenAsn1: contentInfo, tokenB64, genTime };
}
