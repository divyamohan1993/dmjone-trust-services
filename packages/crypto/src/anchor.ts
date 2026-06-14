/**
 * External anchoring — publishes a Signed Tree Head to free, immutable, public
 * places so anyone can prove the transparency log was not altered or back-dated:
 *
 *  - GitHub: commit `heads/<seq>.json` to a public repo via the contents API.
 *    The commit SHA + timestamp is an independent, publicly auditable record.
 *  - OpenTimestamps (Bitcoin): DEFERRED — not implemented. No receipt is emitted
 *    (a placeholder would be a false claim of Bitcoin anchoring). The real
 *    implementation will submit head digests to a free public OTS calendar and
 *    persist the genuine, relying-party-upgradeable receipt.
 *
 * Everything is injectable (fetch) and degrades gracefully: with nothing
 * configured, {@link AnchorPublisher.publish} returns a proof carrying just the
 * head identity and a timestamp — it NEVER throws, so a publish hiccup can never
 * break issuance (the in-log signed head is the primary tamper-evidence).
 */

import type { AnchorProof, AnchorPublisher, SignedTreeHead } from '@dmjone/shared';
import { bytesToBase64, toUtf8Bytes } from './hash.js';

export interface AnchorPublisherConfig {
  /** `owner/name` of the public GitHub repo to publish heads into. */
  githubRepo?: string;
  /** A GitHub token with contents:write on the repo. Never logged. */
  githubToken?: string;
  /** Branch to commit to (defaults to the repo default branch). */
  githubBranch?: string;
  /** RESERVED for the future real OpenTimestamps implementation. Currently a
   *  no-op: no receipt (real or placeholder) is emitted. */
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

      // OpenTimestamps / Bitcoin anchoring is DEFERRED (no real implementation
      // ships yet). We deliberately emit NOTHING here rather than a placeholder
      // receipt: a fake `.ots` blob in a court-facing evidence bundle would be a
      // dishonest claim of Bitcoin anchoring that does not exist. `otsEnabled` is
      // reserved for the future real implementation (submit head digests to a
      // free public OTS calendar + persist the genuine upgradeable receipt).
      void config.otsEnabled;

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

