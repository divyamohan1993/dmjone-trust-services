/**
 * Admin authentication API: WebAuthn registration + login, TOTP enrollment +
 * verification, recovery-code setup, and recovery-based passkey registration.
 *
 * Security model:
 *  - Login = passkey OR (recovery code + TOTP). A verified passkey alone mints a
 *    session; TOTP is NOT additionally required after a passkey.
 *  - Registration is gated: the unprovisioned bootstrap path (first passkey, or
 *    re-bootstrap after a factory reset / empty restore) requires a valid
 *    ADMIN_SETUP_TOKEN and is fail-closed in production; the provisioned path
 *    requires a valid admin session (adding keys / post-recovery). Recovery
 *    reuses the latter — recovery+TOTP mints a `via:'recovery'` session which
 *    then authorises the normal register flow, so there is exactly one register
 *    door. The token closes the land-grab window that recurs whenever passkeys
 *    hit zero. See evaluateRegistration.
 *  - Brute-force: passkey failures back off only (never permanent); the
 *    guessable recovery+TOTP path backs off AND permanently locks after
 *    MAX_AUTH_FAILURES. The lock is checked BEFORE any Argon2 work.
 *  - Every auth event is written to the tamper-evident audit log. Secrets and
 *    recovery plaintext are returned to the client at most once and never logged.
 */

import { Hono } from 'hono';

import { AppError, ERROR_CODE } from '@dmjone/shared';
import type { AdminAccount } from '@dmjone/shared';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';

import type { IssuerDeps } from '../deps.js';
import type { IssuerHonoEnv } from '../http/context.js';
import { clearSession, issueSession, readSession } from '../auth/session.js';
import {
  emptyAdmin,
  evaluateRegistration,
  freshAdminId,
  getAdmin,
  isProvisioned,
} from '../auth/admin-store.js';
import type { RegistrationGate } from '../auth/admin-store.js';
import { evaluateLock, recordFailure, recordSuccess } from '../auth/lockout.js';
import { consumeRecoveryCode, generateRecoveryCodes } from '../auth/recovery.js';
import { enrollTotp, verifyTotp } from '../auth/totp.js';
import { renderQrPng } from '@dmjone/render';
import {
  finishAuthentication,
  finishRegistration,
  startAuthentication,
  startRegistration,
} from '../auth/webauthn.js';

async function readJson(c: { req: { json(): Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new AppError(ERROR_CODE.BAD_REQUEST, 'Request body must be valid JSON', 400);
  }
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

async function audit(
  deps: IssuerDeps,
  requestId: string,
  action: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  await deps.auditLog.append({
    actor: 'admin',
    action,
    requestId,
    ...(meta && { meta }),
  });
}

const SETUP_TOKEN_HEADER = 'x-setup-token';

/** Map a denied {@link RegistrationGate} to its uniform AppError. */
function denyRegistration(gate: Extract<RegistrationGate, { allowed: false }>): AppError {
  switch (gate.reason) {
    case 'session_required':
      // Provisioned account: adding a passkey needs an authenticated session.
      return new AppError(ERROR_CODE.FORBIDDEN, 'Registration is not open', 403);
    case 'setup_disabled':
      // Production with no ADMIN_SETUP_TOKEN configured → fail closed.
      return new AppError(
        ERROR_CODE.FORBIDDEN,
        'Admin setup is disabled (no setup token configured)',
        403,
      );
    case 'bad_setup_token':
      return new AppError(ERROR_CODE.FORBIDDEN, 'Invalid or missing setup token', 403);
  }
}

export function registerAuthRoutes(app: Hono<IssuerHonoEnv>, deps: IssuerDeps): void {
  const auth = new Hono<IssuerHonoEnv>();

  // ─────────────────────────── Status (public) ─────────────────────────────
  // Lets the UI decide between "first-time setup" and "login".
  auth.get('/status', async (c) => {
    const account = await getAdmin(deps.adminRepo);
    const session = await readSession(c, deps.env);
    return c.json({
      provisioned: isProvisioned(account),
      passkeys: account?.webauthnCredentials.length ?? 0,
      totpEnrolled: !!account?.totpSecretEnc,
      authenticated: !!session,
    });
  });

  // ──────────────────────── WebAuthn registration ──────────────────────────
  // BOOTSTRAP GATE: the unprovisioned (first-passkey / post-factory-reset) path
  // requires a valid ADMIN_SETUP_TOKEN (header `x-setup-token`), and is
  // fail-closed in production when no token is configured. The provisioned path
  // stays session-gated. See evaluateRegistration for the full decision table.
  auth.post('/register/options', async (c) => {
    const account = await getAdmin(deps.adminRepo);
    const session = await readSession(c, deps.env);
    const token = c.req.header(SETUP_TOKEN_HEADER);
    const gate = evaluateRegistration(deps.env, account, !!session, token);
    if (!gate.allowed) {
      await audit(deps, c.get('requestId'), 'admin.register.denied', {
        stage: 'options',
        reason: gate.reason,
      });
      throw denyRegistration(gate);
    }
    const working = account ?? emptyAdmin(new Date().toISOString());
    const options = await startRegistration(c, deps.env, working, 'passkey');
    return c.json(options);
  });

  auth.post('/register/verify', async (c) => {
    const account = await getAdmin(deps.adminRepo);
    const session = await readSession(c, deps.env);
    const body = (await readJson(c)) as {
      response?: RegistrationResponseJSON;
      label?: string;
      setupToken?: string;
    };
    // Token may arrive via header or body (the verify POST already carries a body).
    const token = c.req.header(SETUP_TOKEN_HEADER) ?? asString(body.setupToken);
    const gate = evaluateRegistration(deps.env, account, !!session, token);
    if (!gate.allowed) {
      await audit(deps, c.get('requestId'), 'admin.register.denied', {
        stage: 'verify',
        reason: gate.reason,
      });
      throw denyRegistration(gate);
    }
    if (!body.response) {
      throw new AppError(ERROR_CODE.VALIDATION_FAILED, 'Missing registration response', 400);
    }
    const label = asString(body.label) ?? 'passkey';
    const { credential } = await finishRegistration(c, deps.env, body.response, label);

    const now = new Date().toISOString();
    const bootstrap = !isProvisioned(account);
    const base: AdminAccount = account ?? { ...emptyAdmin(now), id: freshAdminId() };
    const updated: AdminAccount = {
      ...base,
      webauthnCredentials: [...base.webauthnCredentials, credential],
      updatedAt: now,
    };
    await deps.adminRepo.save(updated);
    await audit(deps, c.get('requestId'), 'admin.passkey.register', {
      label: credential.label,
      bootstrap,
      total: updated.webauthnCredentials.length,
    });

    // First passkey at bootstrap: hand the new admin an immediate session so the
    // rest of setup (TOTP, recovery) proceeds without a second ceremony.
    if (bootstrap) {
      await issueSession(c, deps.env, { sub: updated.id, via: 'passkey' });
    }
    return c.json({ registered: true, bootstrap, passkeys: updated.webauthnCredentials.length });
  });

  // ──────────────────────── WebAuthn authentication ────────────────────────
  auth.post('/login/options', async (c) => {
    const account = await getAdmin(deps.adminRepo);
    if (!isProvisioned(account)) {
      throw new AppError(ERROR_CODE.UNAUTHENTICATED, 'No admin is provisioned', 401);
    }
    const options = await startAuthentication(c, deps.env, account);
    return c.json(options);
  });

  auth.post('/login/verify', async (c) => {
    const account = await getAdmin(deps.adminRepo);
    if (!isProvisioned(account)) {
      throw new AppError(ERROR_CODE.UNAUTHENTICATED, 'No admin is provisioned', 401);
    }
    const body = (await readJson(c)) as { response?: AuthenticationResponseJSON };
    if (!body.response) {
      throw new AppError(ERROR_CODE.VALIDATION_FAILED, 'Missing authentication response', 400);
    }

    let outcome;
    try {
      outcome = await finishAuthentication(c, deps.env, account, body.response);
    } catch (err) {
      // Passkey failures are audited but NOT counted toward the lock and NOT
      // rate-limited at the app layer (see lockout.ts): passkeys are unforgeable,
      // and an adminRepo write on every unauthenticated miss would be a write-
      // amplification vector. Cloudflare is the volumetric shield for /login/*.
      await audit(deps, c.get('requestId'), 'admin.login.passkey.fail');
      throw err;
    }

    // Persist the advanced counter (replay protection) + clear any prior lock.
    const now = Date.now();
    const cleared = recordSuccess(account, now);
    const updated: AdminAccount = {
      ...cleared,
      webauthnCredentials: cleared.webauthnCredentials.map((cred) =>
        cred.credentialId === outcome.credentialId
          ? { ...cred, counter: outcome.newCounter }
          : cred,
      ),
    };
    await deps.adminRepo.save(updated);
    await issueSession(c, deps.env, { sub: updated.id, via: 'passkey' });
    await audit(deps, c.get('requestId'), 'admin.login.passkey.success', {
      credentialId: outcome.credentialId,
    });
    return c.json({ authenticated: true });
  });

  // ─────────────────────────────── Logout ──────────────────────────────────
  auth.post('/logout', async (c) => {
    clearSession(c, deps.env);
    await audit(deps, c.get('requestId'), 'admin.logout');
    return c.json({ ok: true });
  });

  // ───────────────────────────── TOTP enroll ───────────────────────────────
  // Gated: must already hold a session (bootstrap passkey grants one).
  auth.post('/totp/enroll', async (c) => {
    const session = await readSession(c, deps.env);
    if (!session) throw new AppError(ERROR_CODE.UNAUTHENTICATED, 'Authentication required', 401);
    const account = await getAdmin(deps.adminRepo);
    if (!account) throw new AppError(ERROR_CODE.NOT_FOUND, 'No admin account', 404);

    const enrollment = enrollTotp(deps.env, deps.secretSealer);
    // AdminAccount.totpSecretEnc is the SINGLE source of truth for the sealed
    // secret (no secretStore mirror — avoids drift). Persisted immediately so a
    // page reload keeps the same secret. /totp/verify lets the admin confirm
    // their authenticator scanned it correctly; the v1 AdminAccount model has no
    // separate "confirmed" flag, so the secret is live from enrollment (the gate
    // is the admin session here).
    const now = new Date().toISOString();
    await deps.adminRepo.save({ ...account, totpSecretEnc: enrollment.encryptedSecret, updatedAt: now });
    await audit(deps, c.get('requestId'), 'admin.totp.enroll.begin');

    // Render the provisioning URI to a scannable QR PNG so the admin can scan it
    // with any authenticator app, instead of being shown a raw otpauth:// string.
    const qrPng = await renderQrPng(enrollment.otpauthUri);
    return c.json({
      otpauthUri: enrollment.otpauthUri,
      base32Secret: enrollment.base32Secret,
      qrPngDataUri: `data:image/png;base64,${Buffer.from(qrPng).toString('base64')}`,
    });
  });

  auth.post('/totp/verify', async (c) => {
    const session = await readSession(c, deps.env);
    if (!session) throw new AppError(ERROR_CODE.UNAUTHENTICATED, 'Authentication required', 401);
    const account = await getAdmin(deps.adminRepo);
    if (!account?.totpSecretEnc) {
      throw new AppError(ERROR_CODE.BAD_REQUEST, 'TOTP is not enrolled', 400);
    }
    const body = (await readJson(c)) as { token?: string };
    const token = asString(body.token) ?? '';
    const ok = verifyTotp(deps.env, deps.secretSealer, account.totpSecretEnc, token);
    await audit(deps, c.get('requestId'), ok ? 'admin.totp.verify.success' : 'admin.totp.verify.fail');
    if (!ok) throw new AppError(ERROR_CODE.AUTH_CHALLENGE_FAILED, 'Invalid TOTP code', 401);
    return c.json({ verified: true });
  });

  // ─────────────────────────── Recovery setup ──────────────────────────────
  // Gated: generates N one-time codes, returns plaintext ONCE, stores hashes.
  auth.post('/recovery/generate', async (c) => {
    const session = await readSession(c, deps.env);
    if (!session) throw new AppError(ERROR_CODE.UNAUTHENTICATED, 'Authentication required', 401);
    const account = await getAdmin(deps.adminRepo);
    if (!account) throw new AppError(ERROR_CODE.NOT_FOUND, 'No admin account', 404);

    const { plaintext, hashes } = await generateRecoveryCodes(deps.passwordHasher);
    const now = new Date().toISOString();
    await deps.adminRepo.save({ ...account, recoveryCodeHashes: hashes, updatedAt: now });
    await audit(deps, c.get('requestId'), 'admin.recovery.generate', { count: hashes.length });
    // Plaintext shown exactly once; never persisted, never logged.
    return c.json({ recoveryCodes: plaintext });
  });

  // ───────────────── Recovery login → fresh-passkey registration ────────────
  // Last-resort path: recovery code + TOTP → mint a `via:'recovery'` session.
  // The client then calls the normal /register/options + /register/verify
  // (now authorised by that session) to enrol a new passkey.
  auth.post('/recovery/login', async (c) => {
    const account = await getAdmin(deps.adminRepo);
    if (!account || account.recoveryCodeHashes.length === 0 || !account.totpSecretEnc) {
      throw new AppError(ERROR_CODE.UNAUTHENTICATED, 'Recovery is not available', 401);
    }

    // Lock check FIRST — before any Argon2 work — so the endpoint can't be a
    // CPU-burn amplifier, and so a permanent lock is enforced.
    const now = Date.now();
    const lock = evaluateLock(account, deps.env.MAX_AUTH_FAILURES, now);
    if (lock.locked) {
      await audit(deps, c.get('requestId'), 'admin.recovery.locked', {
        permanent: lock.permanent,
      });
      if (lock.permanent) {
        throw new AppError(
          ERROR_CODE.ACCOUNT_LOCKED,
          'Account permanently locked after too many failed recovery attempts; reinstall required',
          423,
        );
      }
      throw new AppError(
        ERROR_CODE.ACCOUNT_LOCKED,
        `Too many attempts; retry after ${Math.ceil(lock.retryAfterMs / 1000)}s`,
        423,
      );
    }

    const body = (await readJson(c)) as { recoveryCode?: string; token?: string };
    const recoveryCode = asString(body.recoveryCode) ?? '';
    const token = asString(body.token) ?? '';

    const totpOk = verifyTotp(deps.env, deps.secretSealer, account.totpSecretEnc, token);
    const consumed = totpOk
      ? await consumeRecoveryCode(deps.passwordHasher, recoveryCode, account.recoveryCodeHashes)
      : null;

    if (!totpOk || !consumed) {
      const failed = recordFailure(account, now);
      await deps.adminRepo.save(failed);
      await audit(deps, c.get('requestId'), 'admin.recovery.fail', {
        failureCount: failed.failureCount,
      });
      throw new AppError(ERROR_CODE.AUTH_CHALLENGE_FAILED, 'Invalid recovery code or TOTP', 401);
    }

    // Success: burn the used code, clear the lock, mint a recovery session.
    const cleared = recordSuccess({ ...account, recoveryCodeHashes: consumed.remaining }, now);
    await deps.adminRepo.save(cleared);
    await issueSession(c, deps.env, { sub: cleared.id, via: 'recovery' });
    await audit(deps, c.get('requestId'), 'admin.recovery.success', {
      remaining: consumed.remaining.length,
    });
    return c.json({
      authenticated: true,
      via: 'recovery',
      remainingRecoveryCodes: consumed.remaining.length,
      next: 'register a fresh passkey via /api/auth/register/options',
    });
  });

  app.route('/api/auth', auth);
}
