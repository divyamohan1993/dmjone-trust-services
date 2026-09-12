import { resolveCname, resolveTxt, resolveMx } from 'node:dns/promises';
import { pathToFileURL } from 'node:url';

export const OCI_DKIM_NAME = 'dmjtrust-phx-20260912._domainkey.dmj.one';
export const OCI_DKIM_TARGET = 'dmjtrust-phx-20260912.dmj.one.dkim.phx1.oracleemaildelivery.com';
export async function verifyOciEmailDns(resolver = {resolveCname,resolveTxt,resolveMx}) {
  const [cnames,txt,mx] = await Promise.all([
    resolver.resolveCname(OCI_DKIM_NAME), resolver.resolveTxt('dmj.one'), resolver.resolveMx('dmj.one'),
  ]);
  if (!cnames.some(name => name.toLowerCase().replace(/\.$/,'') === OCI_DKIM_TARGET)) throw new Error('OCI DKIM CNAME is not published correctly');
  const spf = txt.map(parts=>parts.join('')).filter(value=>/^v=spf1(?:\s|$)/i.test(value));
  if (spf.length !== 1) throw new Error('dmj.one must publish exactly one SPF policy');
  const terms = new Set(spf[0].toLowerCase().split(/\s+/));
  for (const domain of ['_spf.firebasemail.com','_spf.mx.cloudflare.net','rp.oracleemaildelivery.com']) {
    if (!terms.has('include:'+domain)) throw new Error('SPF must preserve Firebase and Cloudflare authorization and include OCI');
  }
  if (!mx.length || mx.some(record=>!record.exchange.toLowerCase().replace(/\.$/,'').endsWith('.mx.cloudflare.net'))) {
    throw new Error('Cloudflare inbound MX routing must remain in place');
  }
  return {dkim:'published',spf:'single combined policy',inbound:'Cloudflare MX preserved'};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const timeout=setTimeout(()=>{console.error('Email DNS check timed out');process.exit(1);},20000);
  try {console.log(JSON.stringify(await verifyOciEmailDns()));}
  catch {console.error('Email DNS readiness check failed. Check the OCI DKIM CNAME, single SPF policy, and unchanged Cloudflare MX routing.');process.exitCode=1;}
  finally {clearTimeout(timeout);}
}
