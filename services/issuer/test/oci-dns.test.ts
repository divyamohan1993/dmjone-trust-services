import { describe, expect, it } from 'vitest';

// The same check used by CI; fixtures do not query or change real DNS.
const script = new URL('../../../scripts/check-oci-email-dns.mjs', import.meta.url).href;
const { verifyOciEmailDns, OCI_DKIM_TARGET } = await import(script);
function resolver() {
  return {
    resolveCname: async () => [OCI_DKIM_TARGET+'.'],
    resolveTxt: async () => [['v=spf1 include:_spf.firebasemail.com include:_spf.mx.cloudflare.net ', 'include:rp.oracleemaildelivery.com ~all']],
    resolveMx: async () => [{exchange:'route1.mx.cloudflare.net',priority:10}],
  };
}
describe('deployment email DNS gate',()=>{
  it('accepts the DKIM CNAME, combined SPF and preserved Cloudflare MX',async()=>{
    expect(await verifyOciEmailDns(resolver())).toMatchObject({inbound:'Cloudflare MX preserved'});
  });
  it('rejects duplicate SPF policies',async()=>{
    const r=resolver(); r.resolveTxt=async()=>[['v=spf1 include:_spf.mx.cloudflare.net ~all'],['v=spf1 include:rp.oracleemaildelivery.com ~all']];
    await expect(verifyOciEmailDns(r)).rejects.toThrow('exactly one');
  });
  it('rejects absent DKIM or a changed inbound provider',async()=>{
    await expect(verifyOciEmailDns({...resolver(),resolveCname:async()=>[]})).rejects.toThrow('DKIM');
    await expect(verifyOciEmailDns({...resolver(),resolveMx:async()=>[{exchange:'mail.other.example',priority:10}]})).rejects.toThrow('Cloudflare');
  });
});
