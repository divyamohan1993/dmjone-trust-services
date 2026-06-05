/**
 * In-process token-bucket rate limiter for the super-admin surface.
 *
 * The super-admin standard requires DDoS early-reject: a rejected request must
 * be turned away with a tiny static response BEFORE any DB / CPU / memory-heavy
 * work (no body parse, no auth, no Firestore touch). This bucket is that gate.
 * It is per-process (Cloud Run scale-to-zero, single admin → one or few
 * instances); the real volumetric shield is Cloudflare at the edge, this is
 * defence-in-depth at the origin.
 *
 * Pure + injectable clock so the refill math is unit-testable.
 */

export interface TokenBucketOptions {
  /** Maximum tokens (burst). */
  capacity: number;
  /** Tokens added per second. */
  refillPerSecond: number;
}

export class TokenBucket {
  private tokens: number;
  private lastRefillMs: number;
  private readonly capacity: number;
  private readonly refillPerSecond: number;

  constructor(opts: TokenBucketOptions, now: number = Date.now()) {
    this.capacity = opts.capacity;
    this.refillPerSecond = opts.refillPerSecond;
    this.tokens = opts.capacity;
    this.lastRefillMs = now;
  }

  /** Attempt to take one token. Returns true if allowed, false if throttled. */
  take(now: number = Date.now()): boolean {
    this.refill(now);
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  private refill(now: number): void {
    if (now <= this.lastRefillMs) return;
    const elapsedSec = (now - this.lastRefillMs) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.refillPerSecond);
    this.lastRefillMs = now;
  }
}
