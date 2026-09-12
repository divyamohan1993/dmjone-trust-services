import { describe, expect, it } from 'vitest';
import type { AdminAccount } from '@dmjone/shared';
import { createIssuerApp } from '../src/app.js';
import { buildDeps } from './fakes.js';
import { mintSessionCookie } from './session-helper.js';

function account(): AdminAccount {
  return { id: 'admin', webauthnCredentials: [
    { credentialId: 'key-one', label: 'My phone', publicKey: 'public-key-material', counter: 8, transports: ['internal'], createdAt: '2026-08-01T12:00:00Z', lastUsedAt: '2026-09-12T12:00:00Z' },
    { credentialId: 'key-two', label: 'Backup USB', publicKey: 'backup-public-key', counter: 0, transports: ['usb'], createdAt: '2026-08-02T12:00:00Z' },
  ], totpSecretEnc: 'sealed-totp', recoveryCodeHashes: ['recovery-hash'], failureCount: 0,
  createdAt: '2026-08-01T12:00:00Z', updatedAt: '2026-08-02T12:00:00Z' };
}
async function fixture(credentialId?: string) {
  const deps = buildDeps(); deps.adminRepo.account = account();
  const app = createIssuerApp(deps);
  const cookie = await mintSessionCookie(deps.env, { sub:'admin', via:'passkey', ...(credentialId && { credentialId }) });
  const post = (action: string, body: unknown, authCookie = cookie) => app.request('/api/auth/passkeys/'+action, {
    method:'POST', headers:{'content-type':'application/json', cookie:authCookie}, body:JSON.stringify(body),
  });
  return { deps, app, cookie, post };
}

describe('registered key management', () => {
  it('requires authentication for listing, renaming, and removal', async () => {
    const { app, post } = await fixture();
    expect((await app.request('/api/auth/passkeys')).status).toBe(401);
    expect((await post('rename', { credentialId:'key-one', label:'New name' }, '')).status).toBe(401);
    expect((await post('remove', { credentialId:'key-one' }, '')).status).toBe(401);
  });

  it('requires JSON and rejects cross-origin browser mutations', async () => {
    const { app, cookie, deps } = await fixture();
    for (const headers of [
      { 'content-type':'text/plain', cookie },
      { 'content-type':'application/json', origin:'https://untrusted.example', cookie },
    ]) {
      const res = await app.request('/api/auth/passkeys/remove', { method:'POST', headers, body:JSON.stringify({credentialId:'key-one'}) });
      expect([403,415]).toContain(res.status);
    }
    expect(deps.adminRepo.account!.webauthnCredentials).toHaveLength(2);
  });

  it('lists only safe metadata, identifying the current key and unknown historical usage', async () => {
    const { app, cookie } = await fixture('key-one');
    const res = await app.request('/api/auth/passkeys', { headers:{cookie} });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body.passkeys[0]).toMatchObject({ label:'My phone', current:true, lastUsedAt:'2026-09-12T12:00:00Z' });
    expect(body.passkeys[1]).toMatchObject({ label:'Backup USB', current:false, lastUsedAt:null });
    for (const secret of ['publicKey', 'counter', 'sealed-totp', 'recovery-hash']) expect(JSON.stringify(body)).not.toContain(secret);
  });

  it('renames exactly the selected key without changing other account data', async () => {
    const { deps, post } = await fixture('key-one');
    const before = structuredClone(deps.adminRepo.account!);
    const res = await post('rename', { credentialId:'key-two', label:'  Spare <key>  ' });
    expect(res.status).toBe(200);
    expect(deps.adminRepo.account!.webauthnCredentials[1]).toEqual({ ...before.webauthnCredentials[1], label:'Spare <key>' });
    expect(deps.adminRepo.account!.webauthnCredentials[0]).toEqual(before.webauthnCredentials[0]);
    expect(deps.adminRepo.account!.totpSecretEnc).toBe(before.totpSecretEnc);
    expect(deps.auditLog.events.at(-1)?.action).toBe('admin.passkey.rename');
  });

  it.each(['', '   ', 'x'.repeat(81), 'invalid\nname', 22, null])('rejects invalid key names (%s)', async label => {
    const { post, deps } = await fixture();
    expect((await post('rename', { credentialId:'key-two', label })).status).toBe(400);
    expect(deps.adminRepo.account!.webauthnCredentials[1]?.label).toBe('Backup USB');
  });

  it('rejects missing keys and malformed input without modifying the account', async () => {
    const { post, deps } = await fixture();
    const before = structuredClone(deps.adminRepo.account);
    expect((await post('remove', { credentialId:'missing' })).status).toBe(404);
    expect((await post('remove', null)).status).toBe(404);
    expect((await post('rename', { credentialId:'missing', label:'Valid' })).status).toBe(404);
    expect(deps.adminRepo.account).toEqual(before);
  });

  it('blocks removal of the last key even with recovery configured', async () => {
    const { deps, post } = await fixture('key-one');
    deps.adminRepo.account!.webauthnCredentials.pop();
    expect((await post('remove', { credentialId:'key-one' })).status).toBe(400);
    expect(deps.adminRepo.account!.webauthnCredentials).toHaveLength(1);
  });

  it('removes the selected key, revokes its key-bound sessions, and keeps another key session valid', async () => {
    const { deps, app, post, cookie } = await fixture('key-one');
    const otherCookie = await mintSessionCookie(deps.env, { sub:'admin', via:'passkey', credentialId:'key-two' });
    const res = await post('remove', { credentialId:'key-one' });
    expect(await res.json()).toMatchObject({ removed:true, signedOut:true, remaining:1 });
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
    expect((await app.request('/api/auth/passkeys', {headers:{cookie}})).status).toBe(401);
    expect((await app.request('/api/credentials', {headers:{cookie}})).status).toBe(401);
    expect((await app.request('/api/auth/passkeys', {headers:{cookie:otherCookie}})).status).toBe(200);
    expect(deps.adminRepo.account!.webauthnCredentials.map(k => k.credentialId)).toEqual(['key-two']);
    expect(deps.auditLog.events.at(-1)?.action).toBe('admin.passkey.remove');
  });

  it('does not sign out the caller when removing another key', async () => {
    const { post } = await fixture('key-one');
    expect(await (await post('remove', {credentialId:'key-two'})).json()).toMatchObject({ signedOut:false });
  });

  it('serializes concurrent removals so at least one key always remains', async () => {
    const { post, deps } = await fixture();
    const responses = await Promise.all([post('remove', { credentialId:'key-one' }), post('remove', { credentialId:'key-two' })]);
    expect(responses.filter(r => r.status === 200)).toHaveLength(1);
    expect(deps.adminRepo.account!.webauthnCredentials).toHaveLength(1);
  });

  it('requires the session to belong to this account', async () => {
    const { deps, app, post } = await fixture();
    const cookie = await mintSessionCookie(deps.env, {sub:'another-account', via:'recovery'});
    expect((await app.request('/api/auth/passkeys', {headers:{cookie}})).status).toBe(403);
    expect((await post('remove', {credentialId:'key-one'}, cookie)).status).toBe(403);
  });
});
