/**
 * AdminAccount persistence helpers (single admin in v1).
 *
 * Centralises reading the one account, creating the empty shell at bootstrap,
 * and the bootstrap gate. The gate is the security crux of registration: a
 * passkey may be registered ONLY when no account exists yet (first-time
 * bootstrap) OR the caller already holds a valid admin session (adding more
 * keys / post-recovery). The instant the first credential is saved, the
 * empty-path slams shut, so an open register endpoint can never mint a second,
 * attacker-controlled admin.
 */

import { randomUUID } from 'node:crypto';

import type { AdminAccount, AdminRepository } from '@dmjone/shared';

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
 * Decide whether a registration ceremony may proceed.
 *  - not provisioned  → allowed (bootstrap)
 *  - provisioned      → allowed only if an admin session is present
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
