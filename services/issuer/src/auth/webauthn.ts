/**
 * WebAuthn passkey ceremonies (registration + authentication) for the sole
 * admin, on top of `@simplewebauthn/server`.
 *
 * The pre-auth challenge problem: login happens before any session exists, so
 * the expected challenge can't be stashed in the session. We store it in a
 * short-TTL, signed, httpOnly cookie with a purpose tag ('reg' vs 'auth') so a
 * registration challenge can never be replayed as an authentication challenge.
 * The cookie is one-time: cleared on verify (success or failure).
 *
 * Credential mapping: the library models a credential as
 * `{ id: base64url, publicKey: Uint8Array, counter, transports }`; our stored
 * {@link WebAuthnCredential} keeps `publicKey` base64-encoded. We convert at the
 * boundary and persist the updated counter after every authentication (replay
 * protection).
 */

import type { Context } from 'hono';
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  WebAuthnCredential as LibWebAuthnCredential,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';

import { AppError, ERROR_CODE } from '@dmjone/shared';
import type { AdminAccount, AppEnv, WebAuthnCredential } from '@dmjone/shared';

/** Issuer env with the WebAuthn relying-party fields narrowed to present. */
export interface WebAuthnEnv {
  rpId: string;
  rpName: string;
  origin: string;
}

/** Pull + assert the WebAuthn RP config (guaranteed for the issuer role at runtime). */
export function webAuthnEnv(env: AppEnv): WebAuthnEnv {
  if (!env.WEBAUTHN_RP_ID || !env.WEBAUTHN_RP_NAME || !env.WEBAUTHN_ORIGIN) {
    throw new AppError(ERROR_CODE.INTERNAL, 'WebAuthn relying-party config is missing', 500);
  }
  return { rpId: env.WEBAUTHN_RP_ID, rpName: env.WEBAUTHN_RP_NAME, origin: env.WEBAUTHN_ORIGIN };
}

type ChallengePurpose = 'reg' | 'auth';
const CHALLENGE_COOKIE: Record<ChallengePurpose, string> = {
  reg: '__Host-dmj_wa_reg',
  auth: '__Host-dmj_wa_auth',
};
/** Challenges are single-shot and short-lived. */
const CHALLENGE_TTL_SECONDS = 300;

async function setChallenge(
  c: Context,
  env: AppEnv,
  purpose: ChallengePurpose,
  challenge: string,
): Promise<void> {
  await setSignedCookie(c, CHALLENGE_COOKIE[purpose], challenge, env.SESSION_SECRET, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    maxAge: CHALLENGE_TTL_SECONDS,
  });
}

async function takeChallenge(
  c: Context,
  env: AppEnv,
  purpose: ChallengePurpose,
): Promise<string | null> {
  let value: string | false | undefined;
  try {
    value = await getSignedCookie(c, env.SESSION_SECRET, CHALLENGE_COOKIE[purpose]);
  } catch {
    value = undefined;
  }
  // One-time: clear regardless of outcome so it can't be replayed. Must carry
  // secure + sameSite to match the set — a `__Host-` cookie deleted without
  // Secure throws ("__Host- Cookie must have Secure attributes"), which would
  // 500 the verify step in production (behind Cloud Run's TLS-terminating proxy).
  deleteCookie(c, CHALLENGE_COOKIE[purpose], { path: '/', secure: true, sameSite: 'Strict' });
  return value === false || value === undefined ? null : value;
}

/** Stable per-credential user handle derived from the admin id. */
function userHandle(account: AdminAccount): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(new TextEncoder().encode(account.id));
}

/** Narrow stored string transports to the library's transport union. */
function asTransports(transports: string[] | undefined): AuthenticatorTransportFuture[] | undefined {
  if (!transports || transports.length === 0) return undefined;
  return transports as AuthenticatorTransportFuture[];
}

/** A credential descriptor for exclude/allow lists, omitting `transports` when absent. */
function credentialDescriptor(cred: WebAuthnCredential): {
  id: string;
  transports?: AuthenticatorTransportFuture[];
} {
  const transports = asTransports(cred.transports);
  return { id: cred.credentialId, ...(transports && { transports }) };
}

function toLibCredential(stored: WebAuthnCredential): LibWebAuthnCredential {
  // Copy into a fresh ArrayBuffer-backed Uint8Array (the lib's type is
  // Uint8Array<ArrayBuffer>, not the ArrayBufferLike that toBuffer yields).
  const publicKey = Uint8Array.from(isoBase64URL.toBuffer(stored.publicKey));
  const transports = asTransports(stored.transports);
  return {
    id: stored.credentialId,
    publicKey,
    counter: stored.counter,
    ...(transports && { transports }),
  };
}

// ───────────────────────────── Registration ────────────────────────────────

export async function startRegistration(
  c: Context,
  env: AppEnv,
  account: AdminAccount,
  label: string,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const rp = webAuthnEnv(env);
  void label;
  const options = await generateRegistrationOptions({
    rpName: rp.rpName,
    rpID: rp.rpId,
    userName: env.ISSUER_CONTACT_EMAIL,
    userID: userHandle(account),
    userDisplayName: 'dmj.one Trust Services Admin',
    attestationType: 'none',
    excludeCredentials: account.webauthnCredentials.map(credentialDescriptor),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  });
  await setChallenge(c, env, 'reg', options.challenge);
  return options;
}

export interface RegistrationOutcome {
  credential: WebAuthnCredential;
}

/**
 * Verify a registration response against the stored challenge and produce a
 * {@link WebAuthnCredential} ready to append to the account. Throws
 * AUTH_CHALLENGE_FAILED on any failure.
 */
export async function finishRegistration(
  c: Context,
  env: AppEnv,
  response: RegistrationResponseJSON,
  label: string,
): Promise<RegistrationOutcome> {
  const rp = webAuthnEnv(env);
  const expectedChallenge = await takeChallenge(c, env, 'reg');
  if (!expectedChallenge) {
    throw new AppError(ERROR_CODE.AUTH_CHALLENGE_FAILED, 'Registration challenge expired', 401);
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpId,
      requireUserVerification: false,
    });
  } catch {
    throw new AppError(ERROR_CODE.AUTH_CHALLENGE_FAILED, 'Registration verification failed', 401);
  }

  if (!verification.verified || !verification.registrationInfo) {
    throw new AppError(ERROR_CODE.AUTH_CHALLENGE_FAILED, 'Registration not verified', 401);
  }

  const info = verification.registrationInfo;
  const transports = asTransports(response.response.transports);
  const credential: WebAuthnCredential = {
    credentialId: info.credential.id,
    publicKey: isoBase64URL.fromBuffer(info.credential.publicKey),
    counter: info.credential.counter,
    label: label.trim() || 'passkey',
    createdAt: new Date().toISOString(),
    ...(transports && { transports }),
  };
  return { credential };
}

// ──────────────────────────── Authentication ───────────────────────────────

export async function startAuthentication(
  c: Context,
  env: AppEnv,
  account: AdminAccount,
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const rp = webAuthnEnv(env);
  const options = await generateAuthenticationOptions({
    rpID: rp.rpId,
    userVerification: 'preferred',
    allowCredentials: account.webauthnCredentials.map(credentialDescriptor),
  });
  await setChallenge(c, env, 'auth', options.challenge);
  return options;
}

export interface AuthenticationOutcome {
  /** The matched credential id. */
  credentialId: string;
  /** Updated signature counter to persist (replay protection). */
  newCounter: number;
}

/**
 * Verify an authentication assertion. On success returns the matched credential
 * id and its new counter (caller persists). Throws AUTH_CHALLENGE_FAILED on any
 * failure, including an unknown credential id.
 */
export async function finishAuthentication(
  c: Context,
  env: AppEnv,
  account: AdminAccount,
  response: AuthenticationResponseJSON,
): Promise<AuthenticationOutcome> {
  const rp = webAuthnEnv(env);
  const expectedChallenge = await takeChallenge(c, env, 'auth');
  if (!expectedChallenge) {
    throw new AppError(ERROR_CODE.AUTH_CHALLENGE_FAILED, 'Authentication challenge expired', 401);
  }

  const stored = account.webauthnCredentials.find((cred) => cred.credentialId === response.id);
  if (!stored) {
    throw new AppError(ERROR_CODE.AUTH_CHALLENGE_FAILED, 'Unknown credential', 401);
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpId,
      credential: toLibCredential(stored),
      requireUserVerification: false,
    });
  } catch {
    throw new AppError(ERROR_CODE.AUTH_CHALLENGE_FAILED, 'Authentication verification failed', 401);
  }

  if (!verification.verified) {
    throw new AppError(ERROR_CODE.AUTH_CHALLENGE_FAILED, 'Authentication not verified', 401);
  }

  return {
    credentialId: stored.credentialId,
    newCounter: verification.authenticationInfo.newCounter,
  };
}
