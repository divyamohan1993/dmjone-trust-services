/**
 * The typed Hono environment for the issuer app.
 *
 * `Variables` are values middleware attaches to the request context and
 * handlers read back type-safely: a per-request correlation id, the CSP nonce,
 * and (once authenticated) the admin session. `Bindings` stays empty — this is
 * a Node process, not a Workers runtime.
 */

import type { AdminSession } from '../auth/session.js';

export interface IssuerVariables {
  requestId: string;
  cspNonce: string;
  session?: AdminSession;
}

export interface IssuerHonoEnv {
  Variables: IssuerVariables;
}
