// Per-IP sliding-window limits for the routes that spend xAI credits. Counts live in memory,
// so every server instance (and every restart) counts on its own: a brake, not a guarantee.

export interface Rule {
  name: string;
  max: number;
  windowMs: number;
}

const MINUTE = 60_000;

export const RULES = {
  read: { name: "read", max: 30, windowMs: 10 * MINUTE },
  // Every voice edit and tapped fix re-runs the review, so it gets more room than a read.
  review: { name: "review", max: 60, windowMs: 10 * MINUTE },
  voiceToken: { name: "voice-token", max: 10, windowMs: 10 * MINUTE },
} satisfies Record<string, Rule>;

/** The limit for a request, or null when it costs nothing (pages, the voice mode check). */
export function ruleFor(method: string, pathname: string): Rule | null {
  const reads = method === "GET" || method === "HEAD";
  switch (pathname.replace(/\/+$/, "")) {
    case "/api/read":
      return RULES.read;
    case "/api/review":
      return RULES.review;
    case "/api/voice-token":
      return reads ? null : RULES.voiceToken;
    default:
      return null;
  }
}

/** The caller's IP as the platform reports it; everyone without one shares a bucket. */
export function clientIp(headers: Headers): string {
  return (
    headers.get("x-real-ip")?.trim() ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export interface LimitResult {
  ok: boolean;
  /** Seconds until the oldest counted request leaves the window (0 when ok). */
  retryAfterS: number;
}

export class SlidingWindowLimiter {
  /** Timestamps of allowed requests per key, least recently used key first. */
  private hits = new Map<string, number[]>();

  constructor(private readonly maxKeys = 10_000) {}

  hit(key: string, rule: Rule, now: number): LimitResult {
    const recent = (this.hits.get(key) ?? []).filter((t) => t > now - rule.windowMs);
    this.hits.delete(key);
    if (recent.length >= rule.max) {
      this.hits.set(key, recent);
      return { ok: false, retryAfterS: Math.max(1, Math.ceil((recent[0] + rule.windowMs - now) / 1000)) };
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > this.maxKeys) this.hits.delete(this.hits.keys().next().value!);
    return { ok: true, retryAfterS: 0 };
  }

  get size(): number {
    return this.hits.size;
  }
}
