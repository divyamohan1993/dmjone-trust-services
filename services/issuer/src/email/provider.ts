/** Sending adapters. Provider acceptance is not a delivery confirmation. */
export interface DocumentEmailMessage {
  documentId: string;
  kind: 'certificate' | 'letter';
  to: string;
  downloadUrl: string;
}
export type DocumentEmailOutcome =
  | { status: 'accepted'; providerId: string }
  | { status: 'rejected' | 'uncertain' };
export interface DocumentEmailSender {
  readonly provider: 'resend' | 'pactmail' | 'oci';
  prepare(message: DocumentEmailMessage): string;
  send(body: string, idempotencyKey: string): Promise<DocumentEmailOutcome>;
}
export const MAIL_FROM = 'dmj.one <contact@dmj.one>';
export function messageText(message: DocumentEmailMessage): string {
  return `Your dmj.one ${message.kind === 'letter' ? 'letter' : 'certificate'} is ready.\n\nDocument ID: ${message.documentId}\n\nVerify and download your signed document:\n${message.downloadUrl}\n\nThe PDF download requires the password shared separately by the issuer. This email does not contain that password.\n\nFor assistance, reply to contact@dmj.one.\n\ndmj.one Trust Services`;
}
async function outcome(response: Response, pactmail = false): Promise<DocumentEmailOutcome> {
  if (!response.ok) {
    await response.body?.cancel();
    return {status: [400,401,403,404,422].includes(response.status) ? 'rejected' : 'uncertain'};
  }
  const reader = response.body?.getReader();
  if (!reader) return {status:'uncertain'};
  const chunks: Uint8Array[] = []; let bytes = 0;
  while (true) {
    const part = await reader.read(); if (part.done) break;
    bytes += part.value.byteLength;
    if (bytes > 4096) { await reader.cancel(); return {status:'uncertain'}; }
    chunks.push(part.value);
  }
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {id?: unknown; status?:unknown; providerId?:unknown};
  const id = pactmail ? body.providerId : body.id;
  if (pactmail && body.status !== 'accepted') return {status:'uncertain'};
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(id) ? {status:'accepted', providerId:id} : {status:'uncertain'};
}
export function createResendEmailSender(key: string, fetcher: typeof fetch = fetch): DocumentEmailSender {
  const apiKey = key.trim();
  if (!/^re_[A-Za-z0-9_-]{16,}$/.test(apiKey)) throw new Error('Mail API key is not configured correctly');
  return { provider:'resend', prepare(message) {
    return JSON.stringify({from:MAIL_FROM, to:[message.to], reply_to:'contact@dmj.one',
      subject:`Your dmj.one ${message.kind} is ready`, text:messageText(message)});
  }, async send(body, idempotencyKey) {
    try {
      return await outcome(await fetcher('https://api.resend.com/emails', {
        method:'POST', redirect:'error', signal:AbortSignal.timeout(10000),
        headers:{Authorization:`Bearer ${apiKey}`, 'Content-Type':'application/json', 'Idempotency-Key':idempotencyKey},
        body,
      }));
    } catch { return {status:'uncertain'}; }
  }};
}
/** Contract in docs/pactmail-delivery-api.md. Disabled until that API is provided. */
export function createPactmailEmailSender(url: string, getToken: () => Promise<string>, fetcher: typeof fetch = fetch): DocumentEmailSender {
  if (new URL(url).protocol !== 'https:') throw new Error('Pactmail sending requires HTTPS');
  return {provider:'pactmail', prepare: message => JSON.stringify(message), async send(body, idempotencyKey) {
    try {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let token: string;
      try {
        token = await Promise.race([getToken(), new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Service identity unavailable')), 8000);
        })]);
      } finally { if (timer) clearTimeout(timer); }
      return await outcome(await fetcher(url, {method:'POST', redirect:'error', signal:AbortSignal.timeout(10000),
        headers:{Authorization:`Bearer ${token}`, 'Content-Type':'application/json', 'Idempotency-Key':idempotencyKey},
        body,
      }), true);
    } catch {return {status:'uncertain'};}
  }};
}
