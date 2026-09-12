import type { AdminAccount } from '@dmjone/shared';
import { describe, expect, it } from 'vitest';

import { createIssuerApp } from '../src/app.js';
import { enrollTotp } from '../src/auth/totp.js';
import { generateRecoveryCodes } from '../src/auth/recovery.js';
import { buildDeps } from './fakes.js';
import { mintSessionCookie } from './session-helper.js';

function post(
  app: ReturnType<typeof createIssuerApp>,
  path: string,
  body: unknown,
  cookie?: string,
): Promise<Response> {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body ?? {}),
  });
}

function provisionedAccount(overrides: Partial<AdminAccount> = {}): AdminAccount {
  return {
    id: 'admin',
    webauthnCredentials: [
      { credentialId: 'cred-1', publicKey: 'pk', counter: 3, label: 'yubikey', createdAt: 'now' },
    ],
    recoveryCodeHashes: [],
    failureCount: 0,
    createdAt: 'now',
    updatedAt: 'now',
    ...overrides,
  };
}

describe('GET /api/auth/status', () => {
  it('reports not-provisioned before any passkey', async () => {
    const app = createIssuerApp(buildDeps());
    const res = await app.request('/api/auth/status');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ provisioned: false, passkeys: 0, authenticated: false });
  });

  it('reports provisioned once a passkey exists', async () => {
    const deps = buildDeps();
    deps.adminRepo.account = provisionedAccount();
    const app = createIssuerApp(deps);
    const res = await app.request('/api/auth/status');
    expect(await res.json()).toMatchObject({ provisioned: true, passkeys: 1 });
  });
});

describe('registration bootstrap gate', () => {
  it('allows register/options at bootstrap (no admin yet)', async () => {
    const app = createIssuerApp(buildDeps());
    const res = await post(app, '/api/auth/register/options', {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as { challenge?: string };
    expect(body.challenge).toBeTruthy();
  });

  it('forbids register/options when provisioned and unauthenticated', async () => {
    const deps = buildDeps();
    deps.adminRepo.account = provisionedAccount();
    const app = createIssuerApp(deps);
    const res = await post(app, '/api/auth/register/options', {});
    expect(res.status).toBe(403);
  });

  it('allows register/options when provisioned WITH a session', async () => {
    const deps = buildDeps();
    deps.adminRepo.account = provisionedAccount();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);
    const res = await post(app, '/api/auth/register/options', {}, cookie);
    expect(res.status).toBe(200);
  });

  // Regression: finishRegistration → takeChallenge deletes the `__Host-dmj_wa_reg`
  // cookie. Deleting a `__Host-` cookie without Secure throws ("__Host- Cookie
  // must have Secure attributes"), which 500'd /register/verify in production
  // (behind Cloud Run's TLS-terminating proxy) and broke every real passkey
  // registration. With no challenge cookie present the verify must reach a CLEAN
  // 401 (challenge expired), proving the cookie deletion no longer crashes.
  it('register/verify survives the __Host- challenge-cookie delete → clean 401', async () => {
    const app = createIssuerApp(buildDeps()); // dev/test → bootstrap gate allows
    const res = await post(app, '/api/auth/register/verify', {
      response: { id: 'x' },
      label: 'primary',
    });
    expect(res.status).toBe(401); // was 500 before the Secure fix
  });
});

describe('bootstrap ADMIN_SETUP_TOKEN gate (production fail-closed)', () => {
  const TOKEN = 'prod-setup-token-abcdefgh'; // pragma: allowlist secret

  function reqOptions(
    app: ReturnType<typeof createIssuerApp>,
    setupToken?: string,
  ): Promise<Response> {
    return app.request('/api/auth/register/options', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(setupToken ? { 'x-setup-token': setupToken } : {}),
      },
      body: '{}',
    });
  }

  it('production + no token configured → 403 (fail closed), no challenge issued', async () => {
    const deps = buildDeps({ env: { NODE_ENV: 'production' } });
    delete (deps.env as { ADMIN_SETUP_TOKEN?: string }).ADMIN_SETUP_TOKEN;
    const app = createIssuerApp(deps);
    const res = await reqOptions(app, TOKEN); // token presented but none configured
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe('FORBIDDEN');
  });

  it('production + token configured + correct token → 200 (bootstrap allowed)', async () => {
    const deps = buildDeps({ env: { NODE_ENV: 'production', ADMIN_SETUP_TOKEN: TOKEN } });
    const app = createIssuerApp(deps);
    const res = await reqOptions(app, TOKEN);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { challenge?: string }).challenge).toBeTruthy();
  });

  it('production + token configured + wrong/missing token → 403', async () => {
    const deps = buildDeps({ env: { NODE_ENV: 'production', ADMIN_SETUP_TOKEN: TOKEN } });
    const app = createIssuerApp(deps);
    expect((await reqOptions(app, 'nope')).status).toBe(403);
    expect((await reqOptions(app, undefined)).status).toBe(403);
  });

  it('register/verify is gated too: production + no token → 403 before any ceremony', async () => {
    const deps = buildDeps({ env: { NODE_ENV: 'production', ADMIN_SETUP_TOKEN: TOKEN } });
    const app = createIssuerApp(deps);
    const res = await app.request('/api/auth/register/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' }, // no token
      body: JSON.stringify({ response: { id: 'x' }, label: 'primary' }),
    });
    expect(res.status).toBe(403);
    // Account stays unprovisioned — nothing was registered.
    expect(deps.adminRepo.account).toBeNull();
  });
});

describe('login endpoints require provisioning', () => {
  it('401s login/options when no admin is provisioned', async () => {
    const app = createIssuerApp(buildDeps());
    const res = await post(app, '/api/auth/login/options', {});
    expect(res.status).toBe(401);
  });
});

describe('TOTP + recovery setup require a session', () => {
  it('401s totp/enroll without a session', async () => {
    const app = createIssuerApp(buildDeps());
    const res = await post(app, '/api/auth/totp/enroll', {});
    expect(res.status).toBe(401);
  });

  it('stages TOTP without replacing the working authenticator until confirmation', async () => {
    const deps = buildDeps();
    const old = enrollTotp(deps.env, deps.secretSealer);
    deps.adminRepo.account = provisionedAccount({ totpSecretEnc: old.encryptedSecret });
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);
    const res = await post(app, '/api/auth/totp/enroll', {}, cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { otpauthUri: string; base32Secret: string };
    expect(body.otpauthUri).toContain('otpauth://totp/');
    expect(body.base32Secret.length).toBeGreaterThan(0);
    // Secret persisted SEALED on the account as the SINGLE source of truth
    // (never the raw base32, and NOT mirrored to the secret store — drift-free).
    // The injected sealer must round-trip it back.
    expect(deps.adminRepo.account?.totpSecretEnc).toBe(old.encryptedSecret);
    const sealed = deps.adminRepo.account?.pendingTotpSecretEnc;
    expect(sealed).toBeTruthy();
    expect(sealed).not.toContain(body.base32Secret);
    expect(deps.secretSealer.openString(sealed as string)).toBe(body.base32Secret);
    // No secret-store mirror (avoids drift; AdminAccount.totpSecretEnc is canonical).
    expect(deps.secretStore.secrets.has('admin_totp_secret')).toBe(false);
    const { Secret, TOTP } = await import('otpauth');
    const token = new TOTP({ algorithm: 'SHA1', digits: 6, period: 30, secret: Secret.fromBase32(body.base32Secret) }).generate();
    const confirmed = await post(app, '/api/auth/totp/verify', { token }, cookie);
    expect(confirmed.status).toBe(200);
    expect(deps.adminRepo.account?.totpSecretEnc).toBe(sealed);
    expect(deps.adminRepo.account?.pendingTotpSecretEnc).toBeUndefined();
  });

  it('rejects expired or incorrect replacement confirmation and preserves the active authenticator', async () => {
    const deps = buildDeps();
    const old = enrollTotp(deps.env, deps.secretSealer);
    const replacement = enrollTotp(deps.env, deps.secretSealer);
    deps.adminRepo.account = provisionedAccount({
      totpSecretEnc: old.encryptedSecret, pendingTotpSecretEnc: replacement.encryptedSecret,
      pendingTotpExpiresAt: new Date(Date.now() + 600000).toISOString(),
    });
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);
    expect((await post(app, '/api/auth/totp/verify', { token: 'invalid' }, cookie)).status).toBe(401);
    expect(deps.adminRepo.account?.totpSecretEnc).toBe(old.encryptedSecret);
    deps.adminRepo.account!.pendingTotpExpiresAt = new Date(Date.now() - 1).toISOString();
    const { Secret, TOTP } = await import('otpauth');
    const token = new TOTP({ algorithm: 'SHA1', digits: 6, period: 30, secret: Secret.fromBase32(replacement.base32Secret) }).generate();
    expect((await post(app, '/api/auth/totp/verify', { token }, cookie)).status).toBe(401);
    expect(deps.adminRepo.account?.totpSecretEnc).toBe(old.encryptedSecret);
  });

  it('generates one-time recovery codes with a session', async () => {
    const deps = buildDeps();
    deps.adminRepo.account = provisionedAccount();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);
    const res = await post(app, '/api/auth/recovery/generate', {}, cookie);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { recoveryCodes: string[] };
    expect(body.recoveryCodes.length).toBeGreaterThan(0);
    // Only hashes are stored, never plaintext.
    expect(deps.adminRepo.account?.recoveryCodeHashes.length).toBe(body.recoveryCodes.length);
  });
});

describe('recovery login (recovery code + TOTP)', () => {
  // Build an account enrolled with a real TOTP secret + known recovery codes.
  async function enrolledDeps(): Promise<{
    deps: ReturnType<typeof buildDeps>;
    app: ReturnType<typeof createIssuerApp>;
    codes: string[];
    liveToken: () => string;
  }> {
    const deps = buildDeps();
    // Seal with the SAME sealer the route opens with, so verify succeeds.
    const enrollment = enrollTotp(deps.env, deps.secretSealer);
    const { plaintext, hashes } = await generateRecoveryCodes(deps.passwordHasher, 3);
    deps.adminRepo.account = provisionedAccount({
      totpSecretEnc: enrollment.encryptedSecret,
      recoveryCodeHashes: hashes,
    });
    const app = createIssuerApp(deps);
    const { Secret, TOTP } = await import('otpauth');
    const liveToken = (): string =>
      new TOTP({
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: Secret.fromBase32(enrollment.base32Secret),
      }).generate();
    return { deps, app, codes: plaintext, liveToken };
  }

  it('mints a recovery session on valid code + TOTP and burns the code', async () => {
    const { deps, app, codes, liveToken } = await enrolledDeps();
    const res = await post(app, '/api/auth/recovery/login', {
      recoveryCode: codes[0],
      token: liveToken(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { via: string; remainingRecoveryCodes: number };
    expect(body.via).toBe('recovery');
    expect(body.remainingRecoveryCodes).toBe(2); // one burned
    expect(deps.adminRepo.account?.recoveryCodeHashes.length).toBe(2);
    expect(deps.adminRepo.account?.failureCount).toBe(0);
  });

  it('records a failure and backs off on a bad code', async () => {
    const { deps, app, liveToken } = await enrolledDeps();
    const res = await post(app, '/api/auth/recovery/login', {
      recoveryCode: 'WRONG-CODES',
      token: liveToken(),
    });
    expect(res.status).toBe(401);
    expect(deps.adminRepo.account?.failureCount).toBe(1);
    expect(deps.adminRepo.account?.lockedUntil).toBeTruthy();
  });

  it('accepts only one of two simultaneous attempts with the same recovery code', async () => {
    const { deps, app, codes, liveToken } = await enrolledDeps();
    const body = { recoveryCode: codes[0], token: liveToken() };
    const responses = await Promise.all([post(app, '/api/auth/recovery/login', body), post(app, '/api/auth/recovery/login', body)]);
    expect(responses.filter(r => r.status === 200)).toHaveLength(1);
    expect(responses.filter(r => r.headers.get('set-cookie')?.includes('__Host-dmj_admin='))).toHaveLength(1);
    expect(deps.adminRepo.account?.recoveryCodeHashes).toHaveLength(2);
  });

  it('requires both recovery factors and accepts recovery after a legacy lock expires', async () => {
    const { deps, app, codes, liveToken } = await enrolledDeps();
    const res = await post(app, '/api/auth/recovery/login', { token: liveToken() });
    expect(res.status).toBe(401);
    deps.adminRepo.account!.failureCount = deps.env.MAX_AUTH_FAILURES;
    deps.adminRepo.account!.updatedAt = new Date(Date.now() - 3600001).toISOString();
    delete deps.adminRepo.account!.lockedUntil;
    expect((await post(app, '/api/auth/recovery/login', { recoveryCode: codes[0], token: liveToken() })).status).toBe(200);
  });

  it('applies a one-hour cooldown at MAX_AUTH_FAILURES before Argon2', async () => {
    const { deps, app, codes, liveToken } = await enrolledDeps();
    // Pre-set the account to the permanent-lock threshold.
    deps.adminRepo.account = provisionedAccount({
      totpSecretEnc: deps.adminRepo.account?.totpSecretEnc as string,
      recoveryCodeHashes: deps.adminRepo.account?.recoveryCodeHashes ?? [],
      failureCount: deps.env.MAX_AUTH_FAILURES,
      updatedAt: new Date().toISOString(),
    });
    const res = await post(app, '/api/auth/recovery/login', {
      recoveryCode: codes[0],
      token: liveToken(),
    });
    expect(res.status).toBe(423);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe('ACCOUNT_LOCKED');
  });
});
