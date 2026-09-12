/** IAM-authenticated recovery-code replacement. Never reads or changes TOTP keys.
 * Build the workspace first. Run with project, database and a PRIVATE output path.
 * No access token, recovery code, or credential material is printed.
 */
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createPasswordHasher } from '@dmjone/crypto';
import { ARGON2_DEFAULTS, GENESIS_HEAD_HASH, RECOVERY_CODE_COUNT } from '@dmjone/shared';
import { auditEventHash } from '@dmjone/data';
import { generateRecoveryCodes } from '../dist/auth/recovery.js';

const [project, database, output] = process.argv.slice(2);
if (!project || !database || !output || !output.startsWith('/')) {
  throw new Error('Usage: node services/issuer/scripts/restore-recovery.mjs PROJECT DATABASE /private/absolute/output.txt');
}
const account = execFileSync('gcloud', ['auth', 'list', '--filter=status:ACTIVE', '--format=value(account)'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
if (!account || account.includes('\n')) throw new Error('Exactly one authenticated gcloud account is required');
// Token stays in process memory and the Authorization header, never argv or disk.
const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const root = `projects/${encodeURIComponent(project)}/databases/${encodeURIComponent(database)}/documents`;
const base = `https://firestore.googleapis.com/v1/${root}`;
async function request(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error(`Firestore request failed (${res.status}); no response body logged`);
  return res.json();
}
// Fetch only account metadata. Do not fetch TOTP ciphertext, passkey material,
// signing keys, session secrets, or existing recovery hashes.
const admin = await request(`${base}/admin/main?mask.fieldPaths=id&mask.fieldPaths=updatedAt`);
if (!admin.updateTime) throw new Error('No existing admin account');
const head = await request(`${base}/audit/_head`);
const seq = Number(head.fields?.seq?.integerValue ?? 0) + 1;
const now = new Date().toISOString();
const event = {
  id: String(seq), at: now, actor: 'system',
  action: 'admin.recovery.operator.replace', requestId: randomUUID(),
  prevHash: head.fields?.hash?.stringValue ?? GENESIS_HEAD_HASH,
  meta: { operator: account, count: RECOVERY_CODE_COUNT, reason: 'Lost recovery codes; existing TOTP remains required' },
};
const hash = auditEventHash(event);
function field(value) {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') return { integerValue: String(value) };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(field) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k,v]) => [k,field(v)])) } };
}
const { plaintext, hashes } = await generateRecoveryCodes(createPasswordHasher(ARGON2_DEFAULTS));
// Create exclusively before changing the database: a failed/unsafe file write
// must never invalidate the owner's existing codes. Parent must be private.
await writeFile(output, `dmj.one Trust Services — recovery codes\nCreated: ${now}\n\nUse ONE code with your current authenticator at https://issue.dmj.one/admin\nEach code works once. Previous recovery codes have been invalidated.\nStore securely offline or in your password manager.\n\n${plaintext.join('\n')}\n`, { mode: 0o600, flag: 'wx' });
try {
  // Atomically change only recovery/lock fields and append the audit chain.
  // Update-time preconditions reject concurrent changes; no silent overwrites.
  await request(`${base}:commit`, { method: 'POST', body: JSON.stringify({ writes: [
    { update: { name: `${root}/admin/main`, fields: {
      recoveryCodeHashes: field(hashes), failureCount: field(0), updatedAt: field(now),
    } }, updateMask: { fieldPaths: ['recoveryCodeHashes', 'failureCount', 'lockedUntil', 'updatedAt'] }, currentDocument: { updateTime: admin.updateTime } },
    { update: { name: `${root}/audit/${String(seq).padStart(12, '0')}`, fields: field({ ...event, hash, seq }).mapValue.fields }, currentDocument: { exists: false } },
    { update: { name: `${root}/audit/_head`, fields: { seq: field(seq), hash: field(hash) } }, currentDocument: { updateTime: head.updateTime } },
  ] }) });
} catch (err) {
  // A transport failure may occur after commit. Keep the private file so codes
  // are not lost in that ambiguous case; never print it. Inspect audit metadata.
  throw new Error('Recovery update could not be confirmed. Private output retained; inspect the audit log before retrying.', { cause: err });
}
const check = await request(`${base}/admin/main?mask.fieldPaths=recoveryCodeHashes&mask.fieldPaths=failureCount`);
const stored = check.fields?.recoveryCodeHashes?.arrayValue?.values ?? [];
if (stored.length !== hashes.length || stored.some((v,i) => v.stringValue !== hashes[i])) {
  throw new Error('Recovery read-back did not match; output retained for operator review');
}
console.log(`Replaced ${hashes.length} recovery codes, cleared recovery cooldown, and recorded audit event ${seq}. Private codes saved to ${output}. Existing passkeys and TOTP unchanged.`);
