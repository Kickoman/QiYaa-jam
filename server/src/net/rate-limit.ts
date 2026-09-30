type Bucket = { tokens: number; at: number };

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly capacity: number,
    private readonly windowMs: number,
  ) {}

  private bucket(key: string, now: number): Bucket {
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, at: now };
    const refill = ((now - bucket.at) * this.capacity) / this.windowMs;
    bucket.tokens = Math.min(this.capacity, bucket.tokens + refill);
    bucket.at = now;
    this.buckets.set(key, bucket);
    return bucket;
  }

  allows(key: string, now: number): boolean {
    return this.bucket(key, now).tokens >= 1;
  }

  take(key: string, now: number): boolean {
    const bucket = this.bucket(key, now);
    if (bucket.tokens < 1) {
      return false;
    }
    bucket.tokens -= 1;
    return true;
  }

  spend(key: string, now: number): void {
    const bucket = this.bucket(key, now);
    bucket.tokens = Math.max(0, bucket.tokens - 1);
  }

  forgetIdle(now: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.tokens + ((now - bucket.at) * this.capacity) / this.windowMs >= this.capacity) {
        this.buckets.delete(key);
      }
    }
  }
}

export class Violations {
  private readonly recent = new Map<string, number[]>();
  private readonly bannedUntil = new Map<string, number>();

  constructor(
    private readonly beforeBan: number,
    private readonly banMs: number,
  ) {}

  record(ip: string, now: number): boolean {
    const times = (this.recent.get(ip) ?? []).filter((time) => time > now - this.banMs);
    times.push(now);
    if (times.length >= this.beforeBan) {
      this.recent.delete(ip);
      this.bannedUntil.set(ip, now + this.banMs);
      return true;
    }
    this.recent.set(ip, times);
    return false;
  }

  isBanned(ip: string, now: number): boolean {
    const until = this.bannedUntil.get(ip);
    if (until === undefined) {
      return false;
    }
    if (until <= now) {
      this.bannedUntil.delete(ip);
      return false;
    }
    return true;
  }
}
