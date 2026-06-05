/**
 * External anchoring — publishes a Signed Tree Head to free, immutable, public
 * places so anyone can prove the transparency log was not altered or back-dated:
 *
 *  - GitHub: commit `heads/<seq>.json` to a public repo via the contents API.
 *    The commit SHA + timestamp is an independent, publicly auditable record.
 *  - OpenTimestamps: a Bitcoin-anchored timestamp (recorded as 'pending' until a
 *    calendar confirms; the receipt is upgradeable later). v1 records the stamp
 *    best-effort and never blocks issuance on it.
 *
 * Everything is injectable (fetch) and degrades gracefully: with nothing
 * configured, {@link AnchorPublisher.publish} returns a proof carrying just the
 * head identity and a timestamp — it NEVER throws, so a publish hiccup can never
 * break issuance (the in-log signed head is the primary tamper-evidence).
 */

import type { AnchorProof, AnchorPublisher, SignedTreeHead } from '@dmjone/shared';
import { bytesToBase64, sha256Hex, toUtf8Bytes } from './hash.js';

export interface AnchorPublisherConfig {
  /** `owner/name` of the public GitHub repo to publish heads into. */
  githubRepo?: string;
  /** A GitHub token with contents:write on the repo. Never logged. */
  githubToken?: string;
  /** Branch to commit to (defaults to the repo default branch). */
  githubBranch?: string;
  /** Enable OpenTimestamps stamping (recorded as 'pending' in v1). */
  otsEnabled?: boolean;
  /** Injected fetch (tests pass a mock; defaults to global fetch). */
  fetchImpl?: typeof fetch;
  /** Clock for `anchoredAt`; injectable for deterministic tests. */
  clock?: () => string;
}

/** GitHub REST base; overridable only via the injected fetch in tests. */
const GITHUB_API_BASE = 'https://api.github.com';

export function createAnchorPublisher(config: AnchorPublisherConfig = {}): AnchorPublisher {
  const doFetch = config.fetchImpl ?? globalThis.fetch;
  const now = config.clock ?? (() => new Date().toISOString());

  return {
    async publish(head: SignedTreeHead): Promise<AnchorProof> {
      const proof: AnchorProof = {
        headSeq: head.seq,
        headHash: head.headHash,
        anchoredAt: now(),
      };

      // GitHub anchor (only if both repo + token are configured).
      if (config.githubRepo && config.githubToken) {
        const github = await publishToGithub(head, config, doFetch);
        if (github) proof.github = github;
      }

      // OpenTimestamps anchor (best-effort, recorded pending).
      if (config.otsEnabled) {
        proof.opentimestamps = makeOtsStub(head);
      }

      return proof;
    },
  };
}

/**
 * PUT heads/<seq>.json to the configured repo. Returns the commit reference, or
 * null on any failure — anchoring is best-effort and must not throw.
 */
async function publishToGithub(
  head: SignedTreeHead,
  config: AnchorPublisherConfig,
  doFetch: typeof fetch,
): Promise<{ repo: string; commitSha: string; url: string } | null> {
  const repo = config.githubRepo!;
  const path = `heads/${head.seq}.json`;
  const url = `${GITHUB_API_BASE}/repos/${repo}/contents/${path}`;
  const contentB64 = bytesToBase64(toUtf8Bytes(`${JSON.stringify(head, null, 2)}\n`));

  const body: Record<string, unknown> = {
    message: `anchor: signed tree head ${head.seq} (${head.headHash.slice(0, 12)})`,
    content: contentB64,
  };
  if (config.githubBranch) body['branch'] = config.githubBranch;

  try {
    const res = await doFetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${config.githubToken!}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      commit?: { sha?: string };
      content?: { html_url?: string };
    };
    const commitSha = data.commit?.sha;
    if (!commitSha) return null;
    return { repo, commitSha, url: data.content?.html_url ?? `https://github.com/${repo}/blob/main/${path}` };
  } catch {
    // Network/parse failure → no GitHub proof; issuance is unaffected.
    return null;
  }
}

/**
 * A deterministic OTS placeholder receipt, recorded as 'pending'. A real OTS
 * calendar submission upgrades this to a Bitcoin-anchored 'confirmed' receipt
 * later; the shape is stable so that upgrade needs no schema change.
 */
function makeOtsStub(head: SignedTreeHead): { otsBase64: string; status: 'pending' } {
  // Bind the stub to the head so it is not a constant blob.
  const digest = sha256Hex(`ots:${head.seq}:${head.headHash}`);
  return { otsBase64: bytesToBase64(toUtf8Bytes(digest)), status: 'pending' };
}
