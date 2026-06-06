/**
 * RFC 3161 trusted timestamping for PAdES-B-T.
 *
 * After the detached PKCS#7 is built, we ask a free Time-Stamping Authority to
 * timestamp the signature value and embed the returned token as the
 * `id-aa-timeStampToken` UNSIGNED attribute on the SignerInfo. Because it is an
 * *unsigned* attribute it is NOT covered by the signature — adding it can never
 * invalidate the signature, and a TSA outage simply means no timestamp (the
 * transparency log + external anchor remain the primary trusted timestamp).
 *
 * Everything here is best-effort: any failure returns/leaves the PKCS#7
 * untouched. Self-contained node-forge ASN.1 — no extra dependency.
 */

import forge from 'node-forge';

const { asn1 } = forge;
const SHA256_OID = '2.16.840.1.101.3.4.2.1';
const ID_AA_TIME_STAMP_TOKEN = '1.2.840.113549.1.9.16.2.14';

export interface TsaOptions {
  /** TSA endpoint that speaks RFC 3161 over HTTP (application/timestamp-query). */
  url: string;
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Per-request timeout (ms). */
  timeoutMs?: number;
}

const toBinary = (b: Uint8Array): string => Buffer.from(b).toString('latin1');

/** Build a DER TimeStampReq (binary string) requesting a token over `data`. */
function buildTimeStampReq(data: Uint8Array): string {
  const md = forge.md.sha256.create();
  md.update(toBinary(data));
  const digest = md.digest().getBytes();

  const req = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, asn1.integerToDer(1).getBytes()),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(SHA256_OID).getBytes()),
        asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, ''),
      ]),
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OCTETSTRING, false, digest),
    ]),
    // certReq = TRUE so the response embeds the TSA cert chain.
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.BOOLEAN, false, String.fromCharCode(0xff)),
  ]);
  return asn1.toDer(req).getBytes();
}

/**
 * Request a timestamp token over `data`. Returns the parsed `timeStampToken`
 * ContentInfo (an ASN.1 object ready to embed), or null on ANY failure.
 */
export async function requestTimestampToken(
  data: Uint8Array,
  opts: TsaOptions,
): Promise<forge.asn1.Asn1 | null> {
  const doFetch = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 5000);
  try {
    const res = await doFetch(opts.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/timestamp-query' },
      body: Buffer.from(buildTimeStampReq(data), 'latin1'),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const respBytes = new Uint8Array(await res.arrayBuffer());
    const resp = asn1.fromDer(forge.util.createBuffer(toBinary(respBytes)));
    // TimeStampResp ::= SEQUENCE { status PKIStatusInfo, timeStampToken ContentInfo OPTIONAL }
    if (!Array.isArray(resp.value) || resp.value.length < 2) return null;
    const statusInfo = resp.value[0];
    const status = Array.isArray(statusInfo?.value) ? statusInfo.value[0] : undefined;
    // PKIStatus: 0 granted, 1 grantedWithMods — anything else is a rejection.
    const statusByte = typeof status?.value === 'string' ? status.value.charCodeAt(0) : 1;
    if (statusByte > 1) return null;
    return (resp.value[1] as forge.asn1.Asn1) ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Inject a timeStampToken as the SignerInfo's unsigned `id-aa-timeStampToken`
 * attribute, in place, on a PKCS#7 ContentInfo ASN.1 tree. Returns true if it
 * was injected. Pure ASN.1 surgery — the signature bytes are untouched.
 */
export function injectTimestampToken(
  p7Asn1: forge.asn1.Asn1,
  token: forge.asn1.Asn1,
): boolean {
  // ContentInfo → [0] content → SignedData; signerInfos is the final SET.
  const content = (p7Asn1.value as forge.asn1.Asn1[])[1];
  const signedData = (content?.value as forge.asn1.Asn1[] | undefined)?.[0];
  const sdChildren = signedData?.value as forge.asn1.Asn1[] | undefined;
  if (!sdChildren?.length) return false;
  const signerInfos = sdChildren[sdChildren.length - 1];
  const signerInfo = (signerInfos?.value as forge.asn1.Asn1[] | undefined)?.[0];
  const siChildren = signerInfo?.value as forge.asn1.Asn1[] | undefined;
  if (!siChildren?.length) return false;

  const unsignedAttrs = asn1.create(asn1.Class.CONTEXT_SPECIFIC, 1, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
      asn1.create(
        asn1.Class.UNIVERSAL,
        asn1.Type.OID,
        false,
        asn1.oidToDer(ID_AA_TIME_STAMP_TOKEN).getBytes(),
      ),
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SET, true, [token]),
    ]),
  ]);
  siChildren.push(unsignedAttrs);
  return true;
}

/** The SignerInfo's signature value (the bytes RFC 3161 timestamps). */
export function signerInfoSignature(p7Asn1: forge.asn1.Asn1): Uint8Array | null {
  const content = (p7Asn1.value as forge.asn1.Asn1[])[1];
  const signedData = (content?.value as forge.asn1.Asn1[] | undefined)?.[0];
  const sdChildren = signedData?.value as forge.asn1.Asn1[] | undefined;
  const signerInfos = sdChildren?.[sdChildren.length - 1];
  const signerInfo = (signerInfos?.value as forge.asn1.Asn1[] | undefined)?.[0];
  const siChildren = signerInfo?.value as forge.asn1.Asn1[] | undefined;
  // The signature is the SignerInfo's only UNIVERSAL OCTET STRING direct child
  // (signed/unsigned attrs are context-tagged) — robust before AND after a
  // timestamp attr is appended.
  const sig = siChildren?.find(
    (c) =>
      c.tagClass === asn1.Class.UNIVERSAL &&
      c.type === asn1.Type.OCTETSTRING &&
      typeof c.value === 'string',
  );
  if (!sig || typeof sig.value !== 'string') return null;
  return new Uint8Array(Buffer.from(sig.value, 'latin1'));
}
