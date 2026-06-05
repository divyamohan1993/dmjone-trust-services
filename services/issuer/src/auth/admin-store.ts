/**
 * AdminAccount persistence helpers (single admin in v1).
 *
 * Centralises reading the one account, creating the empty shell at bootstrap,
 * and the bootstrap gate. The gate is the security crux of registration: a
 * passkey may be registered ONLY when
 *   (a) the account is unprovisioned (zero passkeys) AND a valid ADMIN_SETUP_TOKEN
 *       is presented — first-time bootstrap or re-bootstrap after a factory reset /
 *       empty restore; OR
 *   (b) the caller already holds a valid admin session — adding more keys /
 *       post-recovery.
 * The instant the first credential is saved, the unprovisioned path closes, so an
 * open register endpoint can never mint a second, attacker-controlled admin. The
 * token closes the land-grab window that recurs whenever passkeys hit zero
 * (initial deploy, factory reset, restore-empty); without it, the first visitor
 * to reach /register would become admin.
 */

import { randomUUID, timingSafeEqual } from 'node:crypto';

import type { AdminAccount, AdminRepository, AppEnv } from '@dmjone/shared';

export const ADMIN_ID = 'admin';

/** Fetch the admin account, or null if setup hasn't happened yet. */
export async function getAdmin(repo: AdminRepository): Promise<AdminAccount | null> {
  return repo.get();
}

/** Build an empty admin shell (no credentials, no TOTP). Not yet persisted. */
export function emptyAdmin(now: string): AdminAccount {
  return {
    id: ADMIN_ID,
    webauthnCredentials: [],
    recoveryCodeHashes: [],
    failureCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/** True once at least one passkey is registered (i.e. setup completed). */
export function isProvisioned(account: AdminAccount | null): account is AdminAccount {
  return !!account && account.webauthnCredentials.length > 0;
}

/**
 * Constant-time comparison of a presented setup token against the configured
 * one. Length-mismatch returns false without leaking via early-exit timing.
 */
function setupTokenMatches(provided: string, configured: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(configured, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** The outcome of the registration gate. The route maps each to an HTTP result. */
export type RegistrationGate =
  | { allowed: true; bootstrap: boolean }
  /** Provisioned account, no session — adding a key needs auth. */
  | { allowed: false; reason: 'session_required' }
  /** Bootstrap attempted with a wrong/missing setup token. */
  | { allowed: false; reason: 'bad_setup_token' }
  /** Bootstrap attempted in production with no ADMIN_SETUP_TOKEN configured. */
  | { allowed: false; reason: 'setup_disabled' };

/**
 * Decide whether a registration ceremony may proceed.
 *
 *  - PROVISIONED (≥1 passkey): allowed only with a valid admin session (adding
 *    more keys / post-recovery). The setup token is irrelevant here.
 *  - UNPROVISIONED (bootstrap / re-bootstrap after reset): ALWAYS require a valid
 *    ADMIN_SETUP_TOKEN — a session does NOT substitute here. Otherwise a stolen
 *    session that triggered a factory reset (which zeroes the passkeys) could
 *    immediately re-register the attacker's own passkey with no token, turning an
 *    ephemeral stolen cookie into a durable admin. So:
 *      • valid ADMIN_SETUP_TOKEN → allowed;
 *      • token unset in PRODUCTION → fail closed (setup_disabled), mirroring the
 *        composition root's MASTER_ENCRYPTION_KEY treatment;
 *      • token unset in dev/test → allowed (local dev + the existing test suite
 *        stay green without wiring a token).
 *    Recovery is unaffected: "lost passkeys" leaves the passkey RECORDS on the
 *    account (recovery never clears webauthnCredentials), so a post-recovery
 *    account is PROVISIONED and registers via the session branch above — it never
 *    reaches this unprovisioned path.
 */
export function evaluateRegistration(
  env: AppEnv,
  account: AdminAccount | null,
  hasSession: boolean,
  providedToken: string | undefined,
): RegistrationGate {
  if (isProvisioned(account)) {
    return hasSession ? { allowed: true, bootstrap: false } : { allowed: false, reason: 'session_required' };
  }
  // Unprovisioned → bootstrap path. A session is intentionally NOT accepted here
  // (see docstring: closes the stolen-session → factory-reset → re-register hole).
  const configured = env.ADMIN_SETUP_TOKEN;
  if (!configured) {
    if (env.NODE_ENV === 'production') return { allowed: false, reason: 'setup_disabled' };
    return { allowed: true, bootstrap: true }; // dev/test convenience
  }
  if (providedToken && setupTokenMatches(providedToken, configured)) {
    return { allowed: true, bootstrap: true };
  }
  return { allowed: false, reason: 'bad_setup_token' };
}

/**
 * Decide whether a registration ceremony may proceed (legacy boolean form, kept
 * for the provisioned-session case). Prefer {@link evaluateRegistration}.
 */
export function mayRegister(account: AdminAccount | null, hasSession: boolean): boolean {
  if (!isProvisioned(account)) return true;
  return hasSession;
}

/** Generate a fresh, opaque admin id for a brand-new account (stable thereafter). */
export function freshAdminId(): string {
  // v1 uses a fixed id; kept as a function so multi-tenant can swap it later.
  void randomUUID;
  return ADMIN_ID;
}
