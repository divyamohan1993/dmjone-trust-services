import nodemailer, { type SendMailOptions } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import { MAIL_FROM, messageText, type DocumentEmailSender } from './provider.js';

export const OCI_SMTP_HOST = 'smtp.email.us-phoenix-1.oci.oraclecloud.com';
export interface OciSmtpCredentials { username: string; password: string }
export function parseOciSmtpCredentials(raw: string | undefined): OciSmtpCredentials {
  try {
    const value = JSON.parse(raw ?? '') as OciSmtpCredentials;
    if (!value || typeof value.username !== 'string' || typeof value.password !== 'string' ||
      !value.username || !value.password || /[\r\n]/.test(value.username+value.password)) throw new Error();
    return value;
  } catch {throw new Error('OCI SMTP credentials are missing or invalid');}
}
export function ociSmtpOptions(credentials: OciSmtpCredentials): SMTPTransport.Options {
  return {host:OCI_SMTP_HOST, port:587, secure:false, requireTLS:true,
    auth:{user:credentials.username,pass:credentials.password},
    tls:{servername:OCI_SMTP_HOST, minVersion:'TLSv1.2', rejectUnauthorized:true},
    connectionTimeout:8000, greetingTimeout:8000, socketTimeout:15000, dnsTimeout:5000,
    logger:false, debug:false,
  };
}
type SmtpTransport = Pick<ReturnType<typeof nodemailer.createTransport>, 'sendMail' | 'close'>;
type TransportFactory = (options: SMTPTransport.Options) => SmtpTransport;
export function createOciEmailSender(credentials: OciSmtpCredentials, factory: TransportFactory = options => nodemailer.createTransport(options)): DocumentEmailSender {
  return {provider:'oci', prepare(message) {
    return JSON.stringify({from:MAIL_FROM,to:[message.to],replyTo:'contact@dmj.one',
      subject:`Your dmj.one ${message.kind} is ready`,text:messageText(message),
      messageId:`<dmj-trust-v1.${message.documentId}@dmj.one>`,date:new Date().toUTCString()});
  }, async send(body) {
    const transport = factory(ociSmtpOptions(credentials));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const message = JSON.parse(body) as SendMailOptions;
      const info = await Promise.race([transport.sendMail({...message,disableFileAccess:true,disableUrlAccess:true}), new Promise<never>((_,reject) => {
        timer=setTimeout(() => {transport.close();reject(new Error('SMTP outcome unconfirmed'));},30000);
      })]) as SMTPTransport.SentMessageInfo;
      // A Message-ID identifies the submission; SMTP does NOT deduplicate it.
      return Array.isArray(info.accepted) && info.accepted.length === 1 && typeof info.messageId === 'string'
        ? {status:'accepted',providerId:info.messageId} : {status:'uncertain'};
    } catch (error) {
      const e = error as {responseCode?:number;command?:string};
      // Only explicit permanent SMTP rejection responses are safely retryable.
      // Disconnects/timeouts may follow acceptance and must not be auto-retried.
      const rejected = !!e.responseCode && e.responseCode >= 500 && e.responseCode <= 599 &&
        /^(AUTH(?: .*)?|MAIL FROM|RCPT TO|DATA)$/.test(e.command ?? '');
      return {status:rejected ? 'rejected' : 'uncertain'};
    } finally {if(timer)clearTimeout(timer);transport.close();}
  }};
}
