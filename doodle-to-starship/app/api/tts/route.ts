import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { clientIp, RULES, SlidingWindowLimiter } from "@/lib/rate-limit";
import { metered, synthesize } from "@/lib/xai";

// POST { text, voice, speed? } → audio/mpeg from xAI text-to-speech, cached under public/tts so a
// line is paid for once and then plays instantly (and offline). 204 means "use browser voice":
// nothing cached and no key or budget for a new line. 429 means one IP asked for too many new lines.

const DIR = path.join(process.cwd(), "public", "tts");
const MAX_CHARS = 600;
const DEFAULT_VOICE = "eve";
// Production brake on new lines, per IP. It runs after the cache, so cached lines never count.
const limiter = new SlidingWindowLimiter();

export function POST(request: Request) {
  return metered(() => handle(request));
}

async function handle(request: Request) {
  const body = (await request.json().catch(() => null)) as { text?: unknown; voice?: unknown; speed?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, MAX_CHARS) : "";
  if (!text) return new Response(null, { status: 204 });
  const voice = typeof body?.voice === "string" && /^[a-z0-9]{2,16}$/i.test(body.voice) ? body.voice.toLowerCase() : DEFAULT_VOICE;
  const rawSpeed = typeof body?.speed === "number" ? body.speed : 1;
  const speed = Math.round(Math.min(1.5, Math.max(0.7, rawSpeed)) * 100) / 100;

  // The cache comes first, before any key or budget check: a warmed demo speaks with no network.
  const key = cacheKey({ kind: "tts", text, voice, speed });
  const file = path.join(DIR, `${key}.mp3`);
  const cached = await readFile(file).catch(() => null);
  if (cached && cached.length > 0) return audio(cached, "hit");

  if (process.env.NODE_ENV === "production") {
    const limit = limiter.hit(`${RULES.tts.name}:${clientIp(request.headers)}`, RULES.tts, Date.now());
    if (!limit.ok) {
      return Response.json({ error: "rate-limited" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterS) } });
    }
  }
  const fresh = await synthesize(text, voice, speed);
  if (!fresh) return new Response(null, { status: 204 });
  if (process.env.NODE_ENV !== "production") {
    try {
      await mkdir(DIR, { recursive: true });
      await writeFile(`${file}.tmp`, fresh);
      await rename(`${file}.tmp`, file);
    } catch (err) {
      console.warn("[api/tts] couldn't cache", key, err instanceof Error ? err.message : err);
    }
  }
  return audio(fresh, "miss");
}

/** Sorted-key JSON, hashed: the file name of a cached line. Changing it orphans every cached mp3. */
function cacheKey(parts: Record<string, unknown>): string {
  const sorted = Object.fromEntries(Object.entries(parts).sort(([a], [b]) => a.localeCompare(b)));
  return createHash("sha256").update(JSON.stringify(sorted)).digest("hex").slice(0, 20);
}

function audio(bytes: Uint8Array, cache: "hit" | "miss") {
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "x-tts-cache": cache },
  });
}
