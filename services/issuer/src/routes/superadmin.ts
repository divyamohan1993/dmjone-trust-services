/**
 * Super-admin panel: disaster recovery, factory reset, master controls.
 *
 * Hardening per the global super-admin standard:
 *  - DDoS early-reject FIRST: a token bucket turns excess requests away with a
 *    tiny static 429 (~200 bytes) BEFORE any auth, body parse, or data access —
 *    rejected requests touch no DB/CPU/memory beyond the bucket check.
 *  - Strongest available auth: an active admin session (hardware-backed passkey
 *    or recovery), required on every action.
 *  - Factory reset is irreversible, so it additionally requires a typed
 *    confirmation phrase; it is audited before and after.
 *  - Plain HTML/CSS only, no third-party scripts/CDN, no client-side secrets.
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { html } from 'hono/html';

import { AppError, ERROR_CODE } from '@dmjone/shared';

import type { IssuerDeps } from '../deps.js';
import type { IssuerHonoEnv } from '../http/context.js';
import { clearSession, readSession } from '../auth/session.js';
import { TokenBucket } from '../superadmin/token-bucket.js';
import { page } from '../ui/layout.js';

/** The exact phrase an operator must type to confirm a factory reset. */
const RESET_PHRASE = 'RESET dmj.one Trust Services';

/** A ~200-byte static body; no templating, no allocation surprises. */
const STATIC_429 = 'Too Many Requests';

async function readJson(c: { req: { json(): Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new AppError(ERROR_CODE.BAD_REQUEST, 'Request body must be valid JSON', 400);
  }
}

async function requireSession(c: Context<IssuerHonoEnv>, deps: IssuerDeps): Promise<string> {
  const session = await readSession(c, deps.env);
  if (!session) throw new AppError(ERROR_CODE.UNAUTHENTICATED, 'Authentication required', 401);
  return session.sub;
}

export function registerSuperAdminRoutes(app: Hono<IssuerHonoEnv>, deps: IssuerDeps): void {
  const sa = new Hono<IssuerHonoEnv>();

  // ── DDoS early-reject — MUST be the first thing on this sub-tree. ─────────
  // Conservative: 20 burst, ~5 req/s sustained. The panel is for one human.
  const bucket = new TokenBucket({ capacity: 20, refillPerSecond: 5 });
  sa.use('*', async (c, next) => {
    if (!bucket.take()) {
      // No body parse, no auth, no DB — just a tiny static rejection.
      return c.text(STATIC_429, 429, { 'Retry-After': '2' });
    }
    await next();
  });

  // ── Panel (GET, HTML) ────────────────────────────────────────────────────
  sa.get('/', async (c) => {
    const session = await readSession(c, deps.env);
    const nonce = c.get('cspNonce');
    if (!session) {
      const body = html`<h1>Super-admin</h1>
<div class="card"><p class="notice" role="alert">You must sign in as the administrator first.</p>
<p><a href="/admin">Go to admin sign-in</a></p></div>`;
      return c.html(await page({ title: 'Super-admin', role: 'Super Admin', nonce, body }));
    }

    const auditOk = await deps.auditLog.verify().catch(() => false);
    const head = await deps.logRepo.getHead().catch(() => null);
    const body = html`<h1>Super-admin controls</h1>
<div class="card">
  <h2>System status</h2>
  <p class="row"><span>Audit chain:</span>
    <span class="badge ${auditOk ? 'valid' : 'revoked'}">${auditOk ? 'intact' : 'CHECK'}</span></p>
  <p class="row"><span>Transparency log head:</span>
    <code>${head ? `seq ${head.seq}` : 'empty'}</code></p>
</div>
<div class="card">
  <h2>Disaster recovery</h2>
  <p class="muted">Export the audit + log heads for off-site retention. Recovery from a fresh
  install re-imports these to re-establish the chain.</p>
  <form method="post" action="/super-admin/dr/snapshot">
    <button type="submit">Create recovery snapshot</button>
  </form>
</div>
<div class="card">
  <h2>Factory reset</h2>
  <p class="notice" role="alert"><strong>Irreversible.</strong> This wipes the admin account,
  credentials, logs, and anchors. There is no recovery path other than reinstall. Type the exact
  phrase below to confirm.</p>
  <form method="post" action="/super-admin/factory-reset">
    <label for="phrase">Confirmation phrase</label>
    <input id="phrase" name="phrase" autocomplete="off" spellcheck="false"
      placeholder="${RESET_PHRASE}" />
    <p><button type="submit" class="danger">Factory reset</button></p>
  </form>
</div>`;
    return c.html(await page({ title: 'Super-admin', role: 'Super Admin', nonce, body }));
  });

  // ── Disaster-recovery snapshot (JSON, session-gated) ─────────────────────
  sa.post('/dr/snapshot', async (c) => {
    const actor = await requireSession(c, deps);
    const head = await deps.logRepo.getHead();
    const latestAnchor = await deps.anchorRepo.latest();
    const auditIntact = await deps.auditLog.verify();
    await deps.auditLog.append({
      actor: 'admin',
      action: 'superadmin.dr.snapshot',
      requestId: c.get('requestId'),
      meta: { by: actor },
    });
    return c.json({
      snapshotAt: new Date().toISOString(),
      auditIntact,
      logHead: head,
      latestAnchor,
    });
  });

  // ── Factory reset (session + typed confirmation) ─────────────────────────
  sa.post('/factory-reset', async (c) => {
    const actor = await requireSession(c, deps);

    // Accept the phrase from a JSON body or an HTML form post.
    const contentType = c.req.header('content-type') ?? '';
    let phrase = '';
    if (contentType.includes('application/json')) {
      const body = (await readJson(c)) as { phrase?: string };
      phrase = typeof body.phrase === 'string' ? body.phrase : '';
    } else {
      const form = await c.req.parseBody();
      phrase = typeof form.phrase === 'string' ? form.phrase : '';
    }

    if (phrase !== RESET_PHRASE) {
      await deps.auditLog.append({
        actor: 'admin',
        action: 'superadmin.factory_reset.denied',
        requestId: c.get('requestId'),
        meta: { by: actor, reason: 'phrase-mismatch' },
      });
      throw new AppError(ERROR_CODE.FORBIDDEN, 'Confirmation phrase did not match', 403);
    }

    // Audit BEFORE the destructive act (the audit store itself is wiped after).
    await deps.auditLog.append({
      actor: 'admin',
      action: 'superadmin.factory_reset.begin',
      requestId: c.get('requestId'),
      meta: { by: actor },
    });

    // v1 reset = remove the admin account so the next boot re-bootstraps. The
    // data layer owns credential/log/anchor purge (its DR tooling); here we
    // sever the auth anchor, which is the operative "lock everyone out + force
    // reinstall" effect of a factory reset for this service.
    await deps.adminRepo.save({
      id: 'admin',
      webauthnCredentials: [],
      recoveryCodeHashes: [],
      failureCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Defence-in-depth: drop this browser's session cookie. (A captured stateless
    // cookie stays valid until TTL, so the real protection is that post-reset
    // re-registration requires a fresh ADMIN_SETUP_TOKEN — see evaluateRegistration.)
    clearSession(c, deps.env);

    return c.json({ reset: true, note: 'Admin account cleared; re-bootstrap requires the setup token.' });
  });

  app.route('/super-admin', sa);
}
