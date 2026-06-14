import type { SignedTreeHead } from '@dmjone/shared';
import { describe, expect, it, vi } from 'vitest';
import { createAnchorPublisher } from './anchor.js';

/** A fetch mock with a properly-typed call signature (so mock.calls is a tuple). */
type FetchMock = ReturnType<typeof vi.fn<(...args: Parameters<typeof fetch>) => Promise<Response>>>;

const HEAD: SignedTreeHead = {
  seq: 7,
  headHash: 'a'.repeat(64),
  prevHeadHash: 'b'.repeat(64),
  signature: 'c2lnbmF0dXJl',
  signedAt: '2026-06-05T10:00:00.000Z',
};

/** A fetch mock returning a GitHub contents-API success response. */
function githubOkFetch(): FetchMock {
  return vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          commit: { sha: 'deadbeefcafe' },
          content: { html_url: 'https://github.com/dmjone/anchors/blob/main/heads/7.json' },
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } },
      ),
  );
}

describe('AnchorPublisher — GitHub', () => {
  it('PUTs heads/<seq>.json with the right URL, method, auth and base64 body', async () => {
    const fetchImpl = githubOkFetch();
    const publisher = createAnchorPublisher({
      githubRepo: 'dmjone/anchors',
      githubToken: 'ghs_secret_token', // pragma: allowlist secret
      fetchImpl: fetchImpl as unknown as typeof fetch,
      clock: () => '2026-06-05T12:00:00.000Z',
    });

    const proof = await publisher.publish(HEAD);

    // Exactly one call, to the contents API for this head's path.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchImpl.mock.calls[0]!;
    expect(calledUrl).toBe('https://api.github.com/repos/dmjone/anchors/contents/heads/7.json');
    expect(init?.method).toBe('PUT');

    const headers = init?.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer ghs_secret_token');
    expect(headers['Accept']).toBe('application/vnd.github+json');

    // Body carries a commit message and base64-encoded head JSON.
    const sentBody = JSON.parse(init?.body as string) as { message: string; content: string };
    expect(sentBody.message).toContain('signed tree head 7');
    const decoded = Buffer.from(sentBody.content, 'base64').toString('utf8');
    expect(JSON.parse(decoded)).toMatchObject({ seq: 7, headHash: HEAD.headHash });

    // Proof captures the commit reference.
    expect(proof.github).toEqual({
      repo: 'dmjone/anchors',
      commitSha: 'deadbeefcafe',
      url: 'https://github.com/dmjone/anchors/blob/main/heads/7.json',
    });
    expect(proof.headSeq).toBe(7);
    expect(proof.anchoredAt).toBe('2026-06-05T12:00:00.000Z');
  });

  it('does not leak the token anywhere except the Authorization header', async () => {
    const fetchImpl = githubOkFetch();
    const publisher = createAnchorPublisher({
      githubRepo: 'dmjone/anchors',
      githubToken: 'ghs_super_secret', // pragma: allowlist secret
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const proof = await publisher.publish(HEAD);
    const [, init] = fetchImpl.mock.calls[0]!;
    expect(init?.body as string).not.toContain('ghs_super_secret');
    expect(JSON.stringify(proof)).not.toContain('ghs_super_secret');
  });

  it('degrades gracefully (no github proof) when the API returns an error', async () => {
    const fetchImpl = vi.fn(async () => new Response('forbidden', { status: 403 }));
    const publisher = createAnchorPublisher({
      githubRepo: 'dmjone/anchors',
      githubToken: 'x',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const proof = await publisher.publish(HEAD);
    expect(proof.github).toBeUndefined();
    expect(proof.headSeq).toBe(7);
  });

  it('never throws when fetch itself rejects', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    });
    const publisher = createAnchorPublisher({
      githubRepo: 'dmjone/anchors',
      githubToken: 'x',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(publisher.publish(HEAD)).resolves.toMatchObject({ headSeq: 7 });
  });
});

describe('AnchorPublisher — degraded and OTS', () => {
  it('returns a bare proof and makes no network call when nothing is configured', async () => {
    const fetchImpl = vi.fn();
    const publisher = createAnchorPublisher({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const proof = await publisher.publish(HEAD);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(proof.github).toBeUndefined();
    expect(proof.opentimestamps).toBeUndefined();
    expect(proof).toMatchObject({ headSeq: 7, headHash: HEAD.headHash });
  });

  it('emits NO opentimestamps receipt even when otsEnabled (real OTS deferred; never a fake stub)', async () => {
    // Honesty invariant: a placeholder receipt would falsely claim Bitcoin
    // anchoring that does not exist, and would leak into the court-facing
    // evidence bundle. So `otsEnabled` is a no-op until the real implementation.
    const publisher = createAnchorPublisher({ otsEnabled: true });
    const proof = await publisher.publish(HEAD);
    expect(proof.opentimestamps).toBeUndefined();
  });

  it('makes no network call and emits nothing extra when only otsEnabled is set', async () => {
    const fetchImpl = vi.fn();
    const publisher = createAnchorPublisher({
      otsEnabled: true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const proof = await publisher.publish(HEAD);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(proof.opentimestamps).toBeUndefined();
    expect(proof.github).toBeUndefined();
  });
});
