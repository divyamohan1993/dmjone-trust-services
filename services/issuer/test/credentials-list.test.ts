/**
 * GET /api/credentials — the kind-aware list projection (§D).
 *
 * Issue one of each kind (certificate, letter, upload), then list and assert the
 * row projection:
 *   - every row carries `kind`, `credentialId`, `label`, `status`, `issueDate`,
 *     `createdAt`, `logSeq`;
 *   - certificate rows keep `type` + `recipientName` (existing consumers
 *     unchanged) and label = recipient name;
 *   - letter rows label by subject (else first recipient line);
 *   - upload rows label by original filename;
 *   - no secrets (passwordHash) leak into the projection.
 */

import { describe, expect, it } from 'vitest';

import { createIssuerApp } from '../src/app.js';
import { buildDeps } from './fakes.js';
import { mintSessionCookie } from './session-helper.js';

const ONE_PAGE_PDF_B64 =
  'JVBERi0xLjcKJYGBgYEKCjEgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFsgNSAwIFIgXQovQ291bnQgMQo+PgplbmRvYmoKCjIgMCBvYmoKPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDEgMCBSCj4+CmVuZG9iagoKMyAwIG9iago8PAovUHJvZHVjZXIgPEZFRkYwMDcwMDA2NDAwNjYwMDJEMDA2QzAwNjkwMDYyMDAyMDAwMjgwMDY4MDA3NDAwNzQwMDcwMDA3MzAwM0EwMDJGMDAyRjAwNjcwMDY5MDA3NDAwNjgwMDc1MDA2MjAwMkUwMDYzMDA2RjAwNkQwMDJGMDA0ODAwNkYwMDcwMDA2NDAwNjkwMDZFMDA2NzAwMkYwMDcwMDA2NDAwNjYwMDJEMDA2QzAwNjkwMDYyMDAyOT4KL01vZERhdGUgKEQ6MjAyNjA2MDgwMjI3NDJaKQovQ3JlYXRvciA8RkVGRjAwNzAwMDY0MDA2NjAwMkQwMDZDMDA2OTAwNjIwMDIwMDAyODAwNjgwMDc0MDA3NDAwNzAwMDczMDAzQTAwMkYwMDJGMDA2NzAwNjkwMDc0MDA2ODAwNzUwMDYyMDAyRTAwNjMwMDZGMDA2RDAwMkYwMDQ4MDA2RjAwNzAwMDY0MDA2OTAwNkUwMDY3MDAyRjAwNzAwMDY0MDA2NjAwMkQwMDZDMDA2OTAwNjIwMDI5PgovQ3JlYXRpb25EYXRlIChEOjIwMjYwNjA4MDIyNzQyWikKPj4KZW5kb2JqCgo0IDAgb2JqCjw8Ci9UeXBlIC9Gb250Ci9TdWJ0eXBlIC9UeXBlMQovQmFzZUZvbnQgL0hlbHZldGljYQovRW5jb2RpbmcgL1dpbkFuc2lFbmNvZGluZwo+PgplbmRvYmoKCjUgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1BhcmVudCAxIDAgUgovUmVzb3VyY2VzIDw8Ci9Gb250IDw8Ci9IZWx2ZXRpY2EtNzA5ODQ4MDc4OSA0IDAgUgo+PgovWE9iamVjdCA8PAo+PgovRXh0R1N0YXRlIDw8Cj4+Cj4+Ci9NZWRpYUJveCBbIDAgMCA1OTUuMjggODQxLjg5IF0KL0Fubm90cyBbIF0KL0NvbnRlbnRzIFsgNiAwIFIgXQo+PgplbmRvYmoKCjYgMCBvYmoKPDwKL0ZpbHRlciAvRmxhdGVEZWNvZGUKL0xlbmd0aCAxMTMKPj4Kc3RyZWFtCnicHYq9CsJAEAb77ym2FsTdu/25gFiIEQsbYV9AJIpBC0V8/hiZqYZ5YZtgmnnfsDoMj+/wuV/Oy+CuaeNoHUmjvKIo5RHyX4Wi/GTKJ9amblFDC7v63muY79y8n0uwi4db4SobyhG5QJ84YQJzCBovCmVuZHN0cmVhbQplbmRvYmoKCnhyZWYKMCA3CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAxNiAwMDAwMCBuIAowMDAwMDAwMDc2IDAwMDAwIG4gCjAwMDAwMDAxMjYgMDAwMDAgbiAKMDAwMDAwMDU5NiAwMDAwMCBuIAowMDAwMDAwNjk0IDAwMDAwIG4gCjAwMDAwMDA4OTUgMDAwMDAgbiAKCnRyYWlsZXIKPDwKL1NpemUgNwovUm9vdCAyIDAgUgovSW5mbyAzIDAgUgo+PgoKc3RhcnR4cmVmCjEwODEKJSVFT0Y=';

async function authedPost(
  app: ReturnType<typeof createIssuerApp>,
  cookie: string,
  path: string,
  body: unknown,
): Promise<Response> {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body),
  });
}

interface ListItem {
  credentialId: string;
  kind: string;
  label: string;
  status: string;
  issueDate: string;
  createdAt: string;
  logSeq: number;
  type?: string;
  recipientName?: string;
  passwordHash?: string;
}

describe('GET /api/credentials — kind-aware projection', () => {
  it('projects certificate, letter, and upload rows with the right labels', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    // 1) a certificate
    await authedPost(app, cookie, '/api/credentials', {
      type: 'internship',
      recipientName: 'Asha Rao',
      kicker: 'Certificate of',
      title: 'INTERNSHIP',
      intro: 'This is to certify that',
      bodyParagraphs: ['completed an internship at dmj.one.'],
      issueDate: '2026-06-05',
      attestation: true,
      password: 'a-strong-password', // pragma: allowlist secret
    });
    // 2) a letter
    await authedPost(app, cookie, '/api/letters', {
      issueDate: '2026-06-05',
      recipientLines: ['The Registrar', 'Example University'],
      subject: 'Confirmation of standing',
      bodyParagraphs: ['Body of the letter.'],
      attestation: true,
      password: 'a-strong-password', // pragma: allowlist secret
    });
    // 3) an upload
    await authedPost(app, cookie, '/api/uploads', {
      pdfBase64: ONE_PAGE_PDF_B64,
      originalFilename: 'offer-letter.pdf',
      attestation: true,
      password: 'a-strong-password', // pragma: allowlist secret
    });

    const res = await app.request('/api/credentials', { headers: { cookie } });
    expect(res.status).toBe(200);
    const { items } = (await res.json()) as { items: ListItem[] };
    expect(items).toHaveLength(3);

    const byKind = new Map(items.map((i) => [i.kind, i]));

    const cert = byKind.get('certificate')!;
    expect(cert.credentialId).toBe('DMJ-IC-20260605-01');
    expect(cert.label).toBe('Asha Rao');
    expect(cert.type).toBe('internship');
    expect(cert.recipientName).toBe('Asha Rao');

    const letter = byKind.get('letter')!;
    expect(letter.credentialId).toBe('DMJ-LTR-20260605-01');
    expect(letter.label).toBe('Confirmation of standing');
    // cert-only columns are absent on non-cert rows.
    expect(letter.type).toBeUndefined();
    expect(letter.recipientName).toBeUndefined();

    const upload = byKind.get('upload')!;
    // Uploads derive their issue date server-side (the schema carries none), so
    // the DOC id uses today's date, not the cert/letter body date.
    expect(upload.credentialId).toMatch(/^DMJ-DOC-\d{8}-01$/);
    expect(upload.label).toBe('offer-letter.pdf');

    // No secret ever leaks into the projection.
    for (const item of items) {
      expect(item.passwordHash).toBeUndefined();
      expect(item.issueDate).toBeTruthy();
      expect(typeof item.logSeq).toBe('number');
    }
  });

  it('letter row falls back to the first recipient line when there is no subject', async () => {
    const deps = buildDeps();
    const app = createIssuerApp(deps);
    const cookie = await mintSessionCookie(deps.env);

    await authedPost(app, cookie, '/api/letters', {
      issueDate: '2026-06-05',
      recipientLines: ['The Honourable Registrar', 'Example University'],
      bodyParagraphs: ['Body of the letter.'],
      attestation: true,
      password: 'a-strong-password', // pragma: allowlist secret
    });

    const res = await app.request('/api/credentials', { headers: { cookie } });
    const { items } = (await res.json()) as { items: ListItem[] };
    expect(items[0]!.label).toBe('The Honourable Registrar');
  });
});
