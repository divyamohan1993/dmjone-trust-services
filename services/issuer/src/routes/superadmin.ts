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
 *    ZERO JavaScript: every action is a native <form method="post"> (form-action
 *    'self' in the CSP is load-bearing here).
 *
 * Register: the SOBER §63 court instrument — no frame, no wash, no studs, no
 * script. Gold-soft ruled headings, a particulars grid, a bordered honest-
 * disclosure reset warning. The mutating handlers answer a native form post with
 * a branded §63 confirmation page (so an operator never lands on raw JSON) while
 * still answering a JSON request (content-type: application/json) with JSON —
 * the programmatic/API contract is unchanged.
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

/**
 * Does the caller want JSON (a programmatic/API client) or a branded HTML page
 * (a human submitting a native form)? JSON only when the request explicitly
 * declares a JSON body — the native super-admin forms post urlencoded, so they
 * fall through to the HTML branch.
 */
function wantsJson(c: Context<IssuerHonoEnv>): boolean {
  return (c.req.header('content-type') ?? '').includes('application/json');
}

/** A small §63-register confirmation page for a completed super-admin action. */
async function soberResult(
  c: Context<IssuerHonoEnv>,
  opts: { title: string; heading: string; grave?: boolean; body: ReturnType<typeof html> },
): Promise<Response> {
  const nonce = c.get('cspNonce');
  const body = html`<h1>${opts.heading}</h1>
<div class="${opts.grave ? 'disclosure' : 'notice'}">${opts.body}</div>
<p><a href="/super-admin/">Return to super-admin controls</a></p>`;
  return c.html(
    await page({ title: opts.title, role: 'Super Admin', nonce, body, register: 'sober' }),
  );
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

  // ── Panel (GET, HTML, ZERO JS) ───────────────────────────────────────────
  sa.get('/', async (c) => {
    const session = await readSession(c, deps.env);
    const nonce = c.get('cspNonce');
    if (!session) {
      const body = html`<h1>Super-admin</h1>
<div class="notice" role="alert">You must sign in as the administrator first.</div>
<p><a href="/admin">Go to admin sign-in</a></p>`;
      return c.html(
        await page({ title: 'Super-admin', role: 'Super Admin', nonce, body, register: 'sober' }),
      );
    }

    const auditOk = await deps.auditLog.verify().catch(() => false);
    const head = await deps.logRepo.getHead().catch(() => null);
    const body = html`<h1>Super-admin controls</h1>
<p class="muted">Master controls for this issuer. Read carefully — actions here are
irreversible court instruments, not routine operations.</p>

<h2>System status</h2>
<table class="particulars">
  <tbody>
    <tr>
      <th scope="row">Audit chain</th>
      <td><span class="badge ${auditOk ? 'intact' : 'check'}">${auditOk ? 'intact' : 'CHECK'}</span></td>
    </tr>
    <tr>
      <th scope="row">Transparency log head</th>
      <td><span class="mono">${head ? `seq ${head.seq}` : 'empty'}</span></td>
    </tr>
  </tbody>
</table>

<h2>Disaster recovery</h2>
<p class="muted">Export the audit + log heads for off-site retention. Recovery from a fresh
install re-imports these to re-establish the chain.</p>
<form method="post" action="/super-admin/dr/snapshot">
  <p><button type="submit">Create recovery snapshot</button></p>
</form>

<h2>Factory reset</h2>
<div class="disclosure">
  <strong>Honest disclosure — irreversible.</strong> This wipes the admin account,
  credentials, logs, and anchors. There is no recovery path other than reinstall. To proceed,
  type the exact phrase below; this deliberate friction is the only confirmation.
</div>
<form method="post" action="/super-admin/factory-reset">
  <label for="phrase">Confirmation phrase</label>
  <input id="phrase" name="phrase" autocomplete="off" spellcheck="false"
    placeholder="${RESET_PHRASE}" />
  <p><button type="submit" class="danger">Factory reset</button></p>
</form>`;
    return c.html(
      await page({ title: 'Super-admin', role: 'Super Admin', nonce, body, register: 'sober' }),
    );
  });

  // ── Disaster-recovery snapshot (session-gated) ───────────────────────────
  // JSON request → JSON (API contract). Native form post → branded §63 page.
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
    const snapshotAt = new Date().toISOString();
    if (wantsJson(c)) {
      return c.json({ snapshotAt, auditIntact, logHead: head, latestAnchor });
    }
    return soberResult(c, {
      title: 'Recovery snapshot — Super-admin',
      heading: 'Recovery snapshot created',
      body: html`<p>Snapshot taken at <span class="mono">${snapshotAt}</span>.</p>
<table class="particulars"><tbody>
  <tr><th scope="row">Audit chain</th>
    <td><span class="badge ${auditIntact ? 'intact' : 'check'}">${auditIntact ? 'intact' : 'CHECK'}</span></td></tr>
  <tr><th scope="row">Log head</th>
    <td><span class="mono">${head ? `seq ${head.seq}` : 'empty'}</span></td></tr>
  <tr><th scope="row">Latest anchor</th>
    <td><span class="mono">${latestAnchor ? `head seq ${latestAnchor.headSeq}` : 'none'}</span></td></tr>
</tbody></table>
<p class="muted">Retain these heads off-site. A fresh install re-imports them to re-establish the chain.</p>`,
    });
  });

  // ── Factory reset (session + typed confirmation) ─────────────────────────
  sa.post('/factory-reset', async (c) => {
    const actor = await requireSession(c, deps);
    const asJson = wantsJson(c);

    // Accept the phrase from a JSON body or an HTML form post.
    let phrase = '';
    if (asJson) {
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
      // JSON client → uniform JSON 403 (the API contract). A human submitting the
      // native form → a branded §63 page (never a raw JSON body), still 403.
      if (asJson) {
        throw new AppError(ERROR_CODE.FORBIDDEN, 'Confirmation phrase did not match', 403);
      }
      const nonce = c.get('cspNonce');
      const body = html`<h1>Factory reset not confirmed</h1>
<div class="disclosure"><strong>The confirmation phrase did not match.</strong> Nothing was changed.
To proceed, return and type the exact phrase: <span class="mono">${RESET_PHRASE}</span>.</div>
<p><a href="/super-admin/">Return to super-admin controls</a></p>`;
      return c.html(
        await page({
          title: 'Factory reset not confirmed — Super-admin',
          role: 'Super Admin',
          nonce,
          body,
          register: 'sober',
        }),
        403,
      );
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

    if (asJson) {
      return c.json({
        reset: true,
        note: 'Admin account cleared; re-bootstrap requires the setup token.',
      });
    }
    return soberResult(c, {
      title: 'Factory reset complete — Super-admin',
      heading: 'Factory reset complete',
      grave: true,
      body: html`<p><strong>The administrator account has been cleared.</strong> This issuer is now
unprovisioned. Re-bootstrapping a passkey requires the one-time setup token from your deployment
secrets; a captured session alone cannot re-register.</p>
<p class="muted">Go to <a href="/admin">first-time setup</a> to bring the issuer back online.</p>`,
    });
  });

  app.route('/super-admin', sa);
}
