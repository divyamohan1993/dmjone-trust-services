import { GoogleAuth } from 'google-auth-library';
import type { AppEnv } from '@dmjone/shared';
import { createPactmailEmailSender, createResendEmailSender, type DocumentEmailSender } from './provider.js';

export async function buildEmailSender(env: AppEnv): Promise<DocumentEmailSender | undefined> {
  if (!env.MAIL_PROVIDER || env.MAIL_PROVIDER === 'disabled') return undefined;
  if (env.MAIL_PROVIDER === 'resend') return createResendEmailSender(env.MAIL_API_KEY ?? '');
  if (!env.PACTMAIL_SEND_URL || !env.PACTMAIL_AUDIENCE) throw new Error('Pactmail sending URL and audience must be configured');
  const audience = env.PACTMAIL_AUDIENCE;
  const client = await new GoogleAuth().getIdTokenClient(audience);
  return createPactmailEmailSender(env.PACTMAIL_SEND_URL, () => client.idTokenProvider.fetchIdToken(audience));
}
