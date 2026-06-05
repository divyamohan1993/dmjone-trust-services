/**
 * Liveness + readiness probes.
 *
 * `/health` is shallow (process is up). `/health/ready` is deep: it lightly
 * touches the data layer so an unreachable backing store fails readiness
 * without taking down liveness. Neither requires authentication.
 */

import type { Hono } from 'hono';

import type { IssuerDeps } from '../deps.js';
import type { IssuerHonoEnv } from '../http/context.js';

export function registerHealthRoutes(app: Hono<IssuerHonoEnv>, deps: IssuerDeps): void {
  app.get('/health', (c) => c.json({ status: 'ok', service: 'issuer' }));

  app.get('/health/ready', async (c) => {
    try {
      // A cheap, read-only round-trip that proves the backing store answers.
      await deps.adminRepo.get();
      return c.json({ status: 'ready', service: 'issuer' });
    } catch (err) {
      deps.logger.error({ err }, 'readiness probe failed');
      return c.json({ status: 'unready', service: 'issuer' }, 503);
    }
  });
}
