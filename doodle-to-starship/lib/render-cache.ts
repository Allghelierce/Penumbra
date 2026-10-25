import "server-only";

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

// Offline cache for Grok Imagine output. xAI's image and video URLs are temporary, so a result is
// downloaded once into public/renders/<key>.<ext> and served from there afterwards: instant, no
// cost, and it survives bad venue Wi-Fi. Commit the files to ship a warm cache with the demo.

const DIR = path.join(process.cwd(), "public", "renders");
const PUBLIC_PREFIX = "/renders/";
const DOWNLOAD_TIMEOUT_MS = 20_000;
const MAX_BYTES = 50 * 1024 * 1024;

export const IMAGE_EXTS = ["jpg", "png", "webp"] as const;
export const VIDEO_EXTS = ["mp4"] as const;

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
};
const EXT_MIME: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** A cache file this module wrote: /renders/<20 hex>.<ext>. Anything else is refused. */
const LOCAL_PATH = /^\/renders\/([a-f0-9]{20})\.(jpg|png|webp|mp4)$/;

export function sha(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Stable key for a request: sorted-key JSON, hashed. */
export function cacheKey(parts: Record<string, unknown>): string {
  const sorted = Object.fromEntries(Object.entries(parts).sort(([a], [b]) => a.localeCompare(b)));
  return sha(JSON.stringify(sorted)).slice(0, 20);
}

/** The public URL of a cached file for this key, or null. */
export async function cachedFile(key: string, exts: readonly string[]): Promise<string | null> {
  for (const ext of exts) {
    try {
      const info = await stat(path.join(DIR, `${key}.${ext}`));
      if (info.isFile() && info.size > 0) return `${PUBLIC_PREFIX}${key}.${ext}`;
    } catch {
      // Not cached under this extension.
    }
  }
  return null;
}

/**
 * Downloads a temporary xAI URL (or a data URL) into the cache and returns its public URL.
 * Returns null when saving isn't possible, so callers keep the remote URL. That includes
 * production, where Next serves only the public/ files that existed at build time.
 */
export async function saveRemote(key: string, url: string, fallbackExt: string): Promise<string | null> {
  if (process.env.NODE_ENV === "production") return null;
  try {
    let bytes: Buffer;
    let ext = fallbackExt;
    const data = /^data:([\w/+.-]+);base64,([\s\S]*)$/.exec(url);
    if (data) {
      ext = MIME_EXT[data[1]] ?? ext;
      bytes = Buffer.from(data[2], "base64");
    } else {
      const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS), cache: "no-store" });
      if (!res.ok) throw new Error(`download ${res.status}`);
      ext = MIME_EXT[(res.headers.get("content-type") ?? "").split(";")[0].trim()] ?? ext;
      bytes = Buffer.from(await res.arrayBuffer());
    }
    if (bytes.length === 0 || bytes.length > MAX_BYTES) throw new Error(`bad size ${bytes.length}`);
    await mkdir(DIR, { recursive: true });
    const file = path.join(DIR, `${key}.${ext}`);
    // Write then rename, so the static server never serves a half-written file.
    await writeFile(`${file}.tmp`, bytes);
    await rename(`${file}.tmp`, file);
    return `${PUBLIC_PREFIX}${key}.${ext}`;
  } catch (err) {
    console.warn("[render-cache] couldn't save", key, err instanceof Error ? err.message : err);
    return null;
  }
}

/** True for a URL this cache serves. */
export function isCachedUrl(url: string): boolean {
  return LOCAL_PATH.test(url);
}

/** Reads a cached image back as a data URL, for xAI calls that need the image itself. */
export async function cachedImageAsDataUrl(url: string): Promise<string | null> {
  const match = LOCAL_PATH.exec(url);
  if (!match || !EXT_MIME[match[2]]) return null;
  try {
    const bytes = await readFile(path.join(DIR, `${match[1]}.${match[2]}`));
    return `data:${EXT_MIME[match[2]]};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}
