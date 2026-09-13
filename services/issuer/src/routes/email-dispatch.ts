import {dispatchDueDrafts} from '../drafts/service.js';
import type { Hono } from 'hono';
import { AppError, ERROR_CODE } from '@dmjone/shared';
import type { IssuerDeps } from '../deps.js';
import type { IssuerHonoEnv } from '../http/context.js';
import { dispatchDueEmails } from '../email/delivery.js';

export function registerEmailDispatchRoute(app: Hono<IssuerHonoEnv>, deps: IssuerDeps): void {
  app.post('/api/internal/email/dispatch', async c => {
    const auth = c.req.header('authorization');
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token || token.length > 8192 || !deps.verifyEmailScheduler || !await deps.verifyEmailScheduler(token)) {
      throw new AppError(ERROR_CODE.FORBIDDEN,'Scheduler identity required',403);
    }
    const [emails,drafts]=await Promise.all([dispatchDueEmails(deps,c.get('requestId')),dispatchDueDrafts(deps,c.get('requestId'))]);
    return c.json({...emails,...drafts});
  });
}
