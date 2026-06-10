/**
 * RFC-3161 TimeStampToken verification — the one genuinely new piece of crypto.
 *
 * A timeStampToken is a CMS/PKCS#7 SignedData whose encapsulated content
 * (eContentType = id-ct-TSTInfo, NOT the plain `data` type that
 * forge.pkcs7.messageFromAsn1 supports) is a DER-encoded TSTInfo. Because forge
 * refuses to parse a non-`data` SignedData, we walk the ASN.1 tree by hand —
 * the same hand-navigation `tsa.ts` already uses for injection. We then mirror
 * the auth-attribute machinery proven in verifyPades (verifier.ts).
 *
 * verifyTimestampToken(tokenB64, data) returns valid iff ALL of:
 *   (a) the signer's messageDigest auth-attr == signerDigest(TSTInfo eContent),
 *   (b) the signer's RSA signature over DER(SET OF authenticatedAttributes)
 *       verifies under the embedded signer certificate, AND
 *   (c) the TSTInfo messageImprint.hashedMessage == SHA-256(data).
 * The signer digest in (a)/(b) is read from the token (RSA TSAs vary it —
 * DigiCert SHA-256, Sectigo SHA-384); (c) is fixed at SHA-256 because it echoes
 * the imprint WE sent. (a)+(b) bind the time we read to a verified signature;
 * (c) binds that signed time to OUR data (the raw ML-DSA signature bytes). On
 * success it also returns the asserted genTime (ISO) and the signer-cert subject.
 *
 * Honest scope: this verifies the token's INTERNAL signature, its message
 * imprint, and extracts the asserted time. It does NOT walk the TSA certificate
 * chain to a publicly-trusted root — the token embeds that chain (certReq was
 * TRUE in our request) and full path validation is the relying party's step.
 * So a `valid:true` here is independently-verifiable forensic evidence of WHEN
 * the signature existed, not a statutory presumption. SUPPORTS RSA TSAs with a
 * SHA-2 signing digest only (verified live against DigiCert + Sectigo); an ECDSA
 * TSA such as FreeTSA is not yet verifiable here (→ valid:false) — see env.TSA_URL.
 *
 * NEVER throws: every parse step is guarded; any malformed input → {valid:false}.
 */

import forge from 'node-forge';
import { sha256Hex } from './hash.js';

const { asn1 } = forge;

const SHA256_OID = '2.16.840.1.101.3.4.2.1';
const SHA384_OID = '2.16.840.1.101.3.4.2.2';
const SHA512_OID = '2.16.840.1.101.3.4.2.3';
const ID_SIGNED_DATA = '1.2.840.113549.1.7.2';
const ID_CT_TSTINFO = '1.2.840.113549.1.9.16.1.4';
const ID_MESSAGE_DIGEST = '1.2.840.113549.1.9.4';

/**
 * The SignerInfo digest used for BOTH the messageDigest auth-attr and the
 * signature digest. Real RSA TSAs sign with the SHA-2 family the cert/policy
 * dictates (DigiCert SHA-256, Sectigo SHA-384), so this must be read from the
 * token, not assumed. NOTE: this is independent of the messageImprint hash,
 * which always echoes the SHA-256 WE requested in buildTimeStampReq.
 */
function mdForOid(oid: string | null): forge.md.MessageDigest | null {
  switch (oid) {
    case SHA256_OID:
      return forge.md.sha256.create();
    case SHA384_OID:
      return forge.md.sha384.create();
    case SHA512_OID:
      return forge.md.sha512.create();
    default:
      // Unsupported signer digest (e.g. SHA-1, or an ECDSA cert's non-RSA path).
      return null;
  }
}

export interface TimestampVerifyResult {
  valid: boolean;
  /** TSTInfo genTime as an ISO-8601 string. Present ONLY when `valid` — an
   *  asserted time from an unverified token must never be reported as fact. */
  genTime?: string;
  /** Signer (TSA) certificate subject, e.g. `CN=…, OU=…, C=…`. Present ONLY
   *  when `valid`. */
  tsaSubject?: string;
}

type Asn1 = forge.asn1.Asn1;

/** A node-forge binary (latin1) string → hex, for digest comparison. */
function toHex(binary: string): string {
  return forge.util.bytesToHex(binary);
}

/** All direct children of an ASN.1 SEQUENCE/SET, or [] if it has none. */
function children(node: Asn1 | undefined): Asn1[] {
  return Array.isArray(node?.value) ? (node.value as Asn1[]) : [];
}

/** First UNIVERSAL OID child of a SEQUENCE, decoded; null if absent. */
function firstOid(node: Asn1 | undefined): string | null {
  const oid = children(node).find(
    (c) => c.tagClass === asn1.Class.UNIVERSAL && c.type === asn1.Type.OID,
  );
  return oid && typeof oid.value === 'string' ? asn1.derToOid(oid.value) : null;
}

/**
 * Verify an RFC-3161 TimeStampToken (base64 DER) over `data`. Synchronous and
 * total — returns {valid:false} for any malformed/absent input, never throws.
 */
export function verifyTimestampToken(tokenB64: string, data: Uint8Array): TimestampVerifyResult {
  try {
    const der = Buffer.from(tokenB64, 'base64').toString('latin1');
    if (der.length === 0) return { valid: false };
    const root = asn1.fromDer(forge.util.createBuffer(der));

    // ContentInfo ::= SEQUENCE { contentType OID, content [0] EXPLICIT SignedData }
    const ci = children(root);
    if (ci.length < 2 || asn1.derToOid(ci[0]!.value as string) !== ID_SIGNED_DATA) {
      return { valid: false };
    }
    const signedData = children(ci[1])[0]; // [0] EXPLICIT
    const sd = children(signedData);
    if (sd.length < 4) return { valid: false };

    // SignedData ::= SEQUENCE {
    //   version, digestAlgorithms SET, encapContentInfo SEQUENCE,
    //   certificates [0] IMPLICIT OPTIONAL, crls [1] IMPLICIT OPTIONAL,
    //   signerInfos SET }
    // encapContentInfo is the first UNIVERSAL SEQUENCE after digestAlgorithms.
    const eci = sd.find(
      (c, i) => i >= 2 && c.tagClass === asn1.Class.UNIVERSAL && c.type === asn1.Type.SEQUENCE,
    );
    if (firstOid(eci) !== ID_CT_TSTINFO) return { valid: false };
    // eContent ::= [0] EXPLICIT OCTET STRING (the TSTInfo DER lives inside).
    const eContentCtx = children(eci).find(
      (c) => c.tagClass === asn1.Class.CONTEXT_SPECIFIC && c.type === 0,
    );
    const eContentOctet = children(eContentCtx).find(
      (c) => c.type === asn1.Type.OCTETSTRING && typeof c.value === 'string',
    );
    const tstInfoBin = eContentOctet?.value;
    if (typeof tstInfoBin !== 'string' || tstInfoBin.length === 0) return { valid: false };

    // certificates [0]: a chain may be present (certReq=TRUE). The signer cert
    // is the one matching the SignerInfo's issuerAndSerialNumber, not blindly
    // the first — multi-cert chains otherwise pick the wrong cert.
    const certCtx = sd.find((c) => c.tagClass === asn1.Class.CONTEXT_SPECIFIC && c.type === 0);
    const certAsn1s = children(certCtx).filter(
      (c) => c.tagClass === asn1.Class.UNIVERSAL && c.type === asn1.Type.SEQUENCE,
    );
    if (certAsn1s.length === 0) return { valid: false };

    // signerInfos: the last UNIVERSAL SET; take the first SignerInfo.
    const signerInfosSet = [...sd]
      .reverse()
      .find((c) => c.tagClass === asn1.Class.UNIVERSAL && c.type === asn1.Type.SET);
    const signerInfo = children(signerInfosSet)[0];
    const si = children(signerInfo);
    if (si.length === 0) return { valid: false };

    // SignerInfo ::= SEQUENCE {
    //   version, sid (issuerAndSerialNumber), digestAlgorithm,
    //   signedAttrs [0] IMPLICIT, signatureAlgorithm, signature OCTET STRING }
    const authAttrsCtxIdx = si.findIndex(
      (c) => c.tagClass === asn1.Class.CONTEXT_SPECIFIC && c.type === 0,
    );
    const authAttrs = authAttrsCtxIdx >= 0 ? children(si[authAttrsCtxIdx]) : [];
    const sigOctet = si.find(
      (c) =>
        c.tagClass === asn1.Class.UNIVERSAL &&
        c.type === asn1.Type.OCTETSTRING &&
        typeof c.value === 'string',
    );
    if (authAttrs.length === 0 || typeof sigOctet?.value !== 'string') return { valid: false };
    const signature = sigOctet.value;

    // The signer digestAlgorithm is the SEQUENCE immediately before the [0]
    // signedAttrs (fixed SignerInfo order). It governs BOTH the messageDigest
    // attr and the signature digest — real RSA TSAs vary it (DigiCert SHA-256,
    // Sectigo SHA-384), so it must be read, not assumed. An unsupported digest
    // (or an ECDSA signer, which forge can't verify) → not verified.
    const digestAlgOid = firstOid(si[authAttrsCtxIdx - 1]);
    const signerMd = mdForOid(digestAlgOid);
    if (!signerMd) return { valid: false };

    // (b) Identify the signer cert AND verify the signature in one step: the
    //     signer is whichever embedded cert's public key verifies the RSA
    //     signature over DER(SET OF authenticatedAttributes), hashed with the
    //     signer digest. This deliberately does NOT match on
    //     issuerAndSerialNumber — re-encoding a real (OpenSSL-emitted) issuer DN
    //     or a high-bit serial (leading 0x00) via node-forge is not guaranteed
    //     byte-identical to the token's bytes, so DER/serial matching silently
    //     fails on real TSA chains (certReq=TRUE ⇒ a multi-cert chain is the
    //     common case). Trial-verification is immune to those encoding
    //     differences and proves check (b) at the same time.
    const signerCert = selectSignerCert(certAsn1s, authAttrs, signature, digestAlgOid!);
    const signatureOk = signerCert !== null;

    // (a) messageDigest auth-attr == signerDigest(eContent TSTInfo).
    const messageDigestHex = extractMessageDigestHex(authAttrs);
    const expectedTstDigest = signerMd.update(tstInfoBin).digest().toHex();
    const digestMatch = messageDigestHex !== null && messageDigestHex === expectedTstDigest;

    // (c) TSTInfo messageImprint.hashedMessage == SHA-256(data). This hash is
    //     fixed at SHA-256: it echoes the imprint WE sent in buildTimeStampReq,
    //     regardless of the digest the TSA signs with.
    const tstInfo = asn1.fromDer(forge.util.createBuffer(tstInfoBin));
    const imprintMatch = imprintMatches(tstInfo, data);

    const valid = signatureOk && digestMatch && imprintMatch;
    const out: TimestampVerifyResult = { valid };
    // Report the asserted time + subject ONLY when the token verified — a
    // genTime/subject from an unverified token is meaningless and must never leak
    // as fact.
    if (valid) {
      const genTime = extractGenTimeIso(tstInfo);
      if (genTime !== undefined) out.genTime = genTime;
      const subject = signerCert ? formatSubject(signerCert) : '';
      if (subject.length > 0) out.tsaSubject = subject;
    }
    return out;
  } catch {
    // Any malformed token / unexpected ASN.1 shape → not verified. Never throw.
    return { valid: false };
  }
}

/**
 * Select the signer certificate by trial-verification: the signer is whichever
 * embedded cert's public key verifies the auth-attributes signature (hashed with
 * the signer digest). Returns null if none does (an unverifiable / wrong-key
 * token). Robust against issuer DN re-encoding and serial-number padding
 * differences that break DER/serial matching on real TSA-issued certs. Out of
 * scope: only RSA signer keys are supported (verify uses RSA verify) — RSA TSAs
 * (DigiCert SHA-256, Sectigo SHA-384) are covered; an ECDSA TSA cert (e.g.
 * FreeTSA's ecdsa-with-SHA512) will not match here.
 */
function selectSignerCert(
  certAsn1s: Asn1[],
  authAttrs: Asn1[],
  signature: string,
  digestAlgOid: string,
): forge.pki.Certificate | null {
  for (const certAsn1 of certAsn1s) {
    let cert: forge.pki.Certificate;
    try {
      cert = forge.pki.certificateFromAsn1(certAsn1);
    } catch {
      continue; // Unparseable cert in the chain — try the next.
    }
    if (verifyAuthAttributesSignature(cert, authAttrs, signature, digestAlgOid)) return cert;
  }
  return null;
}

/** Pull the messageDigest OCTET STRING (as hex) from the authenticated attributes. */
function extractMessageDigestHex(authAttrs: Asn1[]): string | null {
  for (const attr of authAttrs) {
    const fields = children(attr);
    if (fields.length < 2) continue;
    const oidNode = fields[0];
    if (typeof oidNode?.value !== 'string' || asn1.derToOid(oidNode.value) !== ID_MESSAGE_DIGEST) {
      continue;
    }
    const octet = children(fields[1])[0];
    if (octet?.value === undefined || typeof octet.value !== 'string') return null;
    return toHex(octet.value);
  }
  return null;
}

/**
 * Verify the RSA signature over the canonical DER of the authenticated
 * attributes, hashed with the signer's digest algorithm (NOT assumed SHA-256 —
 * Sectigo signs with SHA-384). The signature is over an explicit SET (0x31),
 * not the [0] form the attrs appear in. A non-RSA public key (ECDSA) makes
 * rsaPub.verify throw → caught → false.
 */
function verifyAuthAttributesSignature(
  cert: forge.pki.Certificate,
  authAttrs: Asn1[],
  signature: string,
  digestAlgOid: string,
): boolean {
  try {
    const md = mdForOid(digestAlgOid);
    if (!md) return false;
    const attrSet = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, authAttrs);
    const digest = md.update(asn1.toDer(attrSet).getBytes()).digest().getBytes();
    const rsaPub = cert.publicKey as forge.pki.rsa.PublicKey;
    return rsaPub.verify(digest, signature);
  } catch {
    return false;
  }
}

/**
 * TSTInfo ::= SEQUENCE { version, policy OID, messageImprint SEQUENCE {
 *   hashAlgorithm AlgorithmIdentifier, hashedMessage OCTET STRING }, ... }.
 * messageImprint is the first inner SEQUENCE after the policy OID. Confirm its
 * hashAlgorithm is SHA-256 (we only ever request SHA-256) and the imprint equals
 * SHA-256(data).
 */
function imprintMatches(tstInfo: Asn1, data: Uint8Array): boolean {
  const fields = children(tstInfo);
  const messageImprint = fields.find(
    (c, i) => i >= 2 && c.tagClass === asn1.Class.UNIVERSAL && c.type === asn1.Type.SEQUENCE,
  );
  const miChildren = children(messageImprint);
  if (miChildren.length < 2) return false;
  if (firstOid(miChildren[0]) !== SHA256_OID) return false;
  const hashedMessage = miChildren[1];
  if (typeof hashedMessage?.value !== 'string') return false;
  return toHex(hashedMessage.value) === sha256Hex(data);
}

/** Parse the TSTInfo genTime (GeneralizedTime) to an ISO-8601 string, if present. */
function extractGenTimeIso(tstInfo: Asn1): string | undefined {
  const genTime = children(tstInfo).find((c) => c.type === asn1.Type.GENERALIZEDTIME);
  if (!genTime || typeof genTime.value !== 'string') return undefined;
  const parsed = parseGeneralizedTime(genTime.value);
  return parsed ? parsed.toISOString() : undefined;
}

/**
 * Parse an ASN.1 GeneralizedTime ("YYYYMMDDHHMMSS[.fff]Z" — RFC-3161 mandates
 * UTC "Z") to a Date. Returns null on an unrecognized shape (caller omits the
 * field rather than emitting a bad time).
 */
function parseGeneralizedTime(value: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.(\d+))?Z$/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, frac] = m;
  const ms = frac ? Math.round(Number(`0.${frac}`) * 1000) : 0;
  const date = new Date(
    Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s), ms),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Render the certificate subject as a stable `CN=…, OU=…, C=…` string. */
function formatSubject(cert: forge.pki.Certificate): string {
  return cert.subject.attributes
    .map((attr) => {
      const sn = (attr as { shortName?: string }).shortName ?? (attr as { name?: string }).name ?? '?';
      const value = (attr as { value?: unknown }).value;
      return `${sn}=${String(value ?? '')}`;
    })
    .join(', ');
}
