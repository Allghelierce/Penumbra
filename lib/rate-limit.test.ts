import { describe, expect, it } from "vitest";
import { clientIp, ruleFor, RULES, SlidingWindowLimiter } from "./rate-limit";

const rule = { name: "t", max: 3, windowMs: 10_000 };

describe("SlidingWindowLimiter", () => {
  it("allows max requests per window, then blocks with a retry time", () => {
    const limiter = new SlidingWindowLimiter();
    expect([0, 1000, 2000].map((t) => limiter.hit("a", rule, t).ok)).toEqual([true, true, true]);
    expect(limiter.hit("a", rule, 3000)).toEqual({ ok: false, retryAfterS: 7 });
  });

  it("lets requests back in as old ones slide out of the window", () => {
    const limiter = new SlidingWindowLimiter();
    for (const t of [0, 1000, 2000]) limiter.hit("a", rule, t);
    expect(limiter.hit("a", rule, 9999).ok).toBe(false);
    expect(limiter.hit("a", rule, 10_001).ok).toBe(true);
    expect(limiter.hit("a", rule, 10_002).ok).toBe(false);
  });

  it("does not count blocked requests", () => {
    const limiter = new SlidingWindowLimiter();
    for (const t of [0, 1, 2]) limiter.hit("a", rule, t);
    for (let t = 3; t < 9000; t += 100) limiter.hit("a", rule, t);
    expect(limiter.hit("a", rule, 10_001).ok).toBe(true);
  });

  it("keeps separate counts per key", () => {
    const limiter = new SlidingWindowLimiter();
    for (const t of [0, 1, 2]) limiter.hit("a", rule, t);
    expect(limiter.hit("a", rule, 3).ok).toBe(false);
    expect(limiter.hit("b", rule, 3).ok).toBe(true);
  });

  it("forgets the least recently used key past its key limit", () => {
    const limiter = new SlidingWindowLimiter(2);
    for (const t of [0, 1, 2]) limiter.hit("a", rule, t);
    limiter.hit("b", rule, 3);
    limiter.hit("c", rule, 4);
    expect(limiter.size).toBe(2);
    expect(limiter.hit("a", rule, 5).ok).toBe(true);
  });
});

describe("ruleFor", () => {
  it("limits the routes that spend xAI credits", () => {
    expect(ruleFor("POST", "/api/read")).toBe(RULES.read);
    expect(ruleFor("POST", "/api/review")).toBe(RULES.review);
    expect(ruleFor("POST", "/api/voice-token")).toBe(RULES.voiceToken);
    expect(ruleFor("POST", "/api/read/")).toBe(RULES.read);
  });

  it("leaves /api/tts to its route, which counts only uncached lines", () => {
    expect(ruleFor("POST", "/api/tts")).toBeNull();
    expect(RULES.tts).toMatchObject({ max: 60, windowMs: 10 * 60_000 });
  });

  it("leaves free requests alone", () => {
    expect(ruleFor("GET", "/api/voice-token")).toBeNull();
    expect(ruleFor("GET", "/api/prior-art")).toBeNull();
    expect(ruleFor("GET", "/api/xai-status")).toBeNull();
    expect(ruleFor("GET", "/")).toBeNull();
  });
});

describe("clientIp", () => {
  it("prefers x-real-ip, then the first x-forwarded-for hop", () => {
    expect(clientIp(new Headers({ "x-real-ip": "1.2.3.4", "x-forwarded-for": "5.6.7.8" }))).toBe("1.2.3.4");
    expect(clientIp(new Headers({ "x-forwarded-for": "5.6.7.8, 10.0.0.1" }))).toBe("5.6.7.8");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
