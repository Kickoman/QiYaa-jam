import { describe, expect, it } from "vitest";
import { ids } from "../../src/net/ids.js";
import { RateLimiter, Violations } from "../../src/net/rate-limit.js";
import { clientIp, parseTrustedProxies } from "../../src/net/real-ip.js";

describe("clientIp", () => {
  const trusted = parseTrustedProxies("127.0.0.1, 172.30.90.1");

  it("ROOM-60 takes X-Real-IP only from a trusted proxy", () => {
    expect(clientIp("172.30.90.1", "203.0.113.7", trusted)).toBe("203.0.113.7");
    expect(clientIp("::ffff:127.0.0.1", "203.0.113.8", trusted)).toBe("203.0.113.8");
    expect(clientIp("198.51.100.4", "203.0.113.7", trusted)).toBe("198.51.100.4");
    expect(clientIp("172.30.90.1", undefined, trusted)).toBe("172.30.90.1");
  });

  it("trusts only 127.0.0.1 by default", () => {
    expect([...parseTrustedProxies(undefined)]).toEqual(["127.0.0.1"]);
  });
});

describe("RateLimiter", () => {
  it("allows the capacity at once, then refills over the window", () => {
    const limiter = new RateLimiter(10, 60_000);
    for (let request = 0; request < 10; request++) {
      expect(limiter.take("a", 0)).toBe(true);
    }
    expect(limiter.take("a", 0)).toBe(false);
    expect(limiter.take("b", 0)).toBe(true);
    expect(limiter.take("a", 5_999)).toBe(false);
    expect(limiter.take("a", 6_000)).toBe(true);
  });

  it("spend counts a failure without asking", () => {
    const limiter = new RateLimiter(2, 60_000);
    limiter.spend("ip", 0);
    limiter.spend("ip", 0);
    limiter.spend("ip", 0);
    expect(limiter.allows("ip", 0)).toBe(false);
    expect(limiter.allows("ip", 30_000)).toBe(true);
  });
});

describe("Violations", () => {
  it("bans after the third violation within the ban time, for the ban time", () => {
    const violations = new Violations(3, 600_000);
    expect(violations.record("ip", 0)).toBe(false);
    expect(violations.record("ip", 1_000)).toBe(false);
    expect(violations.isBanned("ip", 1_000)).toBe(false);
    expect(violations.record("ip", 2_000)).toBe(true);
    expect(violations.isBanned("ip", 601_999)).toBe(true);
    expect(violations.isBanned("ip", 602_000)).toBe(false);
  });

  it("forgets violations older than the ban time", () => {
    const violations = new Violations(3, 600_000);
    violations.record("ip", 0);
    violations.record("ip", 1);
    expect(violations.record("ip", 600_001)).toBe(false);
  });
});

describe("ids", () => {
  it("match the protocol's formats", () => {
    expect(ids.roomId()).toMatch(/^[0-9a-hjkmnp-tv-z]{8}$/);
    expect(ids.publicId()).toMatch(/^[0-9a-hjkmnp-tv-z]{6}$/);
    expect(ids.joinSecret()).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(ids.hostSecret()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(ids.requestId()).toMatch(/^[A-Za-z0-9_-]{1,36}$/);
  });
});
