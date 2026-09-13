import { OAuth2Client } from 'google-auth-library';
import type { AppEnv } from '@dmjone/shared';

export function buildEmailSchedulerVerifier(env: AppEnv): ((token:string) => Promise<boolean>) | undefined {
  const account = env.EMAIL_SCHEDULER_ACCOUNT, audience = env.EMAIL_SCHEDULER_AUDIENCE;
  if (!account || !audience) return undefined;
  const client = new OAuth2Client();
  return async token => {
    try {
      const ticket = await client.verifyIdToken({idToken:token,audience});
      const p = ticket.getPayload();
      return !!p && p.email === account && p.email_verified === true;
    } catch {return false;}
  };
}
