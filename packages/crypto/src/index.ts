/**
 * @dmjone/crypto — the cryptographic core (Stream A).
 *
 * Implements the @dmjone/shared crypto contracts: hybrid signing (PAdES PKCS#7 +
 * detached ML-DSA-87), signature verification, the transparency-log hash chain
 * (Signed Tree Heads), and external anchoring. Everything is exposed as factory
 * functions that take their dependencies as plain key material / config, so the
 * issuer and verify services wire concrete keys in at composition time.
 *
 * Key custody invariant: the *Signer factories require secret material and run
 * only inside the issuer; the *Verifier factories take public material only and
 * are safe in the keyless verify service.
 */

// Hashing + byte-encoding primitives.
export { base64ToBytes, bytesToBase64, sha256Hex, toUtf8Bytes } from './hash.js';

// Key generation.
export {
  generateMldsaKeypair,
  generateSelfSignedPadesCert,
  mldsaPublicKeyId,
  type MldsaKeypair,
  type PadesCert,
  type PadesCertOptions,
} from './keys.js';

// Certificate helpers (DER + fingerprint).
export { certFingerprint, certPemToDer } from './pades-util.js';

// PAdES signer (custom @signpdf Signer over the X.509 key).
export { ForgePadesSigner } from './pades-signer.js';

// Hybrid signing pipeline (issuer-side).
export { createHybridSigner } from './hybrid-signer.js';

// RFC-3161 trusted timestamping (PAdES-B-T; issuer-side, best-effort).
export {
  requestTimestampToken,
  injectTimestampToken,
  signerInfoSignature,
  type TsaOptions,
} from './tsa.js';

// Signature verification (verify-side, keyless).
export { createSignatureVerifier } from './verifier.js';

// Transparency log (hash chain + Signed Tree Heads).
export {
  createLogSigner,
  createLogVerifier,
  nextHead,
  type NextHeadInput,
  type NextHeadResult,
} from './log.js';

// External anchoring (GitHub + OpenTimestamps).
export { createAnchorPublisher, type AnchorPublisherConfig } from './anchor.js';

// Argon2id password hashing (candidate download password; issuer + verify).
export { createPasswordHasher, type PasswordHasherParams } from './password-hasher.js';
