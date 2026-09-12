import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPasswordHasher } from '@dmjone/crypto';
import { ARGON2_DEFAULTS, RECOVERY_CODE_COUNT } from '@dmjone/shared';
import { normalizeCode } from '../src/auth/recovery.js';

const argv = [...process.argv];
afterEach(() => { process.argv = [...argv]; vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.resetModules(); });

describe('IAM operator recovery procedure', () => {
  it('stores only hashes, preserves TOTP/passkeys, atomically audits, and writes a private file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dmj-recovery-test-'));
    const output = join(dir, 'codes.txt');
    process.argv = ['node', 'restore-recovery.mjs', 'test-project', 'test-db', output];
    vi.doMock('node:child_process', () => ({ execFileSync: (_cmd: string, args: string[]) => args.includes('list') ? 'operator@example.test' : 'test-token' }));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    let writes: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, opts: RequestInit) => {
      expect(opts.headers).toMatchObject({ Authorization: 'Bearer test-token' });
      if (url.endsWith(':commit')) {
        writes = JSON.parse(opts.body as string).writes;
        expect((await stat(output)).mode & 0o777).toBe(0o600);
        return Response.json({});
      }
      if (url.includes('mask.fieldPaths=recoveryCodeHashes')) return Response.json({ fields: writes[0].update.fields });
      if (url.endsWith('/audit/_head')) return Response.json({ updateTime: 'head-version', fields: { seq: { integerValue: '4' }, hash: { stringValue: 'prev' } } });
      expect(url).not.toContain('totpSecretEnc');
      return Response.json({ updateTime: 'admin-version', fields: { id: { stringValue: 'admin' } } });
    }));
    try {
      const script = '../scripts/restore-recovery.mjs';
      await import(script);
      expect(writes).toHaveLength(3);
      expect(writes[0].currentDocument).toEqual({ updateTime: 'admin-version' });
      expect(writes[0].updateMask.fieldPaths).toEqual(['recoveryCodeHashes', 'failureCount', 'lockedUntil', 'updatedAt']);
      expect(writes[2].currentDocument).toEqual({ updateTime: 'head-version' });
      expect(writes[1].update.fields.action.stringValue).toBe('admin.recovery.operator.replace');
      const text = await readFile(output, 'utf8');
      const codes = text.split('\n').filter(s => /^[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){12}$/.test(s));
      expect(codes).toHaveLength(RECOVERY_CODE_COUNT);
      const hashes = writes[0].update.fields.recoveryCodeHashes.arrayValue.values.map((v: any) => v.stringValue);
      expect(await createPasswordHasher(ARGON2_DEFAULTS).verify(normalizeCode(codes[0]!), hashes[0])).toBe(true);
      expect(JSON.stringify(writes)).not.toContain(codes[0]);
    } finally { await rm(dir, { recursive: true, force: true }); }
  }, 30000);
});
