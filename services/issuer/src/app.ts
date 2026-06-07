/**
 * @dmjone/issuer — admin/issuing service (Stream B).
 *
 * Exports {@link createIssuerApp}, a factory that accepts every collaborator as
 * a `@dmjone/shared` interface (dependency injection). No concrete crypto /
 * data / render package is imported here; the orchestrator wires those at the
 * composition root (`src/main.ts`) it owns. That keeps this stream building in
 * parallel and typechecking against the locked contracts alone.
 */

import { Hono } from 'hono';

import type { IssuerDeps } from './deps.js';
import type { IssuerHonoEnv } from './http/context.js';
import { errorHandler, requestId, securityHeaders } from './http/middleware.js';
import { registerAdminUiRoutes } from './routes/admin-ui.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerCredentialRoutes } from './routes/credentials.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerSuperAdminRoutes } from './routes/superadmin.js';

export type { IssuerDeps, SecretSealer } from './deps.js';

/**
 * Build the issuer HTTP application. Pure construction — no I/O, no listening;
 * the caller (composition root) serves the returned Hono instance.
 */
export function createIssuerApp(deps: IssuerDeps): Hono<IssuerHonoEnv> {
  const app = new Hono<IssuerHonoEnv>();

  // Errors thrown anywhere in the chain are dispatched to onError (Hono does not
  // unwind them through upstream middleware), so the uniform ApiError funnel
  // lives there. Middleware order: correlation id first (everything downstream
  // logs it), then per-request nonce + hardening headers.
  app.onError(errorHandler(deps));
  app.use('*', requestId());
  app.use('*', securityHeaders());

  registerHealthRoutes(app, deps);
  registerAuthRoutes(app, deps);
  registerCredentialRoutes(app, deps);
  registerSuperAdminRoutes(app, deps);
  registerAdminUiRoutes(app, deps);

  // Bare domain → the admin console (avoid a raw 404 on `/`).
  app.get('/', (c) => c.redirect('/admin', 302));

  return app;
}
