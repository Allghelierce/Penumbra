import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

// Thin fetch wrappers around the xAI REST API. Every helper resolves to null on
// any failure (no key, timeout, HTTP error, bad JSON) so routes can fall back.

export const XAI_BASE_URL = "https://api.x.ai/v1";
export const VISION_MODEL = "grok-4.7";
/** grok-4.7 defaults to high effort, which is slow. */
const VISION_REASONING = "low";
export const TEXT_MODEL = "grok-4.3";
const TEXT_REASONING = "none";
export const IMAGE_MODEL = "grok-imagine-image-2.0";
/** Polaroid-shaped, fast. Try quality "medium" if renders look rough. */
const IMAGE_OPTIONS = { aspect_ratio: "4:3", resolution: "1k", quality: "low" };
export const VIDEO_MODEL = "grok-imagine-video-1.5-lite";
const VIDEO_OPTIONS = { duration: 6, resolution: "480p" };

/**
 * Live-demo budgets in ms; a slow call is worse than a fallback. Override with XAI_VISION_TIMEOUT_MS,
 * XAI_TEXT_TIMEOUT_MS, XAI_IMAGE_TIMEOUT_MS and XAI_VIDEO_TIMEOUT_MS. Read per call so .env edits apply.
 */
export function timeouts() {
  return {
    vision: envNumber("XAI_VISION_TIMEOUT_MS", 12_000),
    text: envNumber("XAI_TEXT_TIMEOUT_MS", 6_000),
    image: envNumber("XAI_IMAGE_TIMEOUT_MS", 25_000),
    video: envNumber("XAI_VIDEO_TIMEOUT_MS", 15_000),
  };
}

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export type XaiErrorKind = "auth" | "rate-limit" | "server" | "bad-request" | "timeout" | "network" | "budget";

/** Paid calls stop for the rest of the UTC day once metered spend reaches this (XAI_DAILY_BUDGET_USD). */
export function dailyBudgetUsd(): number {
  return envNumber("XAI_DAILY_BUDGET_USD", 15);
}

export interface XaiError {
  kind: XaiErrorKind;
  status: number | null;
  path: string;
  message: string;
  at: string;
}

interface XaiHealth {
  lastError: XaiError | null;
  lastOkAt: string | null;
  /** Metered spend for one UTC day, per server instance. */
  spend: { day: string; ticks: number };
}

const TICKS_PER_USD = 1e10;
const utcDay = () => new Date().toISOString().slice(0, 10);

// On globalThis because dev bundles each route separately; /api/xai-status and the budget must see
// every route's calls.
const health: XaiHealth = ((globalThis as { __xaiHealth?: XaiHealth }).__xaiHealth ??= {
  lastError: null,
  lastOkAt: null,
  spend: { day: utcDay(), ticks: 0 },
});
health.spend ??= { day: utcDay(), ticks: 0 };

function spentTodayUsd(): number {
  if (health.spend.day !== utcDay()) health.spend = { day: utcDay(), ticks: 0 };
  return health.spend.ticks / TICKS_PER_USD;
}

/** Counts a cost toward today's budget and the current request's x-xai-cost-usd header. */
function addCost(ticks: number) {
  spentTodayUsd();
  health.spend.ticks += ticks;
  const meter = costMeter.getStore();
  if (meter) {
    meter.ticks += ticks;
    meter.seen = true;
  }
}

/** The most recent failure (any route), the most recent success and today's spend, for /api/xai-status. */
export function xaiHealth() {
  return {
    lastError: health.lastError,
    lastOkAt: health.lastOkAt,
    spentTodayUsd: Math.round(spentTodayUsd() * 10_000) / 10_000,
    dailyBudgetUsd: dailyBudgetUsd(),
  };
}

function recordError(path: string, status: number | null, kind: XaiErrorKind, message: string) {
  // Never let anything key-shaped reach the status page.
  const clean = message.replace(/xai-[A-Za-z0-9_-]{4,}/g, "xai-…").slice(0, 200);
  health.lastError = { kind, status, path, message: clean, at: new Date().toISOString() };
  console.warn(`[xai] ${path} -> ${status ?? kind}: ${clean}`);
}

function kindOf(status: number, detail: string): XaiErrorKind {
  // xAI answers a wrong key with 400 "Incorrect API key provided", not 401.
  if (status === 401 || status === 403 || /api key/i.test(detail)) return "auth";
  if (status === 429) return "rate-limit";
  return status >= 500 ? "server" : "bad-request";
}

/** Adds up usage.cost_in_usd_ticks for every xAI call made inside metered(). 1 USD = 1e10 ticks. */
const costMeter = new AsyncLocalStorage<{ ticks: number; seen: boolean }>();

/** Runs a route handler and stamps what its xAI calls cost onto the response as x-xai-cost-usd. */
export async function metered(handle: () => Promise<Response>): Promise<Response> {
  const meter = { ticks: 0, seen: false };
  const res = await costMeter.run(meter, handle);
  if (meter.seen) res.headers.set("x-xai-cost-usd", String(meter.ticks / TICKS_PER_USD));
  return res;
}

export function hasXai(): boolean {
  return Boolean(process.env.XAI_API_KEY);
}

/** A JSON Schema object, as sent in response_format. */
export type JsonSchema = Record<string, unknown>;

type ChatContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } }
    >;

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: ChatContent;
}

interface ChatCompletion {
  choices?: Array<{ message?: { content?: string | null } }>;
}

interface ImageResult {
  data?: Array<{ url?: string; b64_json?: string; mime_type?: string }>;
}

interface VideoJob {
  usage?: { cost_in_usd_ticks?: number };
  request_id?: string;
  status?: string;
  progress?: number;
  video?: { url?: string };
}

async function request<T>(method: "GET" | "POST", path: string, body: unknown, timeoutMs: number): Promise<T | null> {
  const key = process.env.XAI_API_KEY;
  if (!key) return null;
  // Spend brake: paid calls fall back like no-key mode; polls (GET) are free and keep working.
  if (method === "POST" && spentTodayUsd() >= dailyBudgetUsd()) {
    recordError(path, null, "budget", `daily xAI budget of $${dailyBudgetUsd()} reached`);
    return null;
  }
  try {
    const res = await fetch(`${XAI_BASE_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${key}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      recordError(path, res.status, kindOf(res.status, detail), detail);
      return null;
    }
    const json = (await res.json()) as T & { usage?: { cost_in_usd_ticks?: number } };
    const ticks = json?.usage?.cost_in_usd_ticks;
    if (typeof ticks === "number") addCost(ticks);
    health.lastOkAt = new Date().toISOString();
    return json;
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const kind = name === "TimeoutError" || name === "AbortError" ? "timeout" : "network";
    recordError(path, null, kind, err instanceof Error ? err.message : String(err));
    return null;
  }
}

async function chat(
  model: string,
  reasoningEffort: string,
  messages: ChatMessage[],
  timeoutMs: number,
  schema?: { name: string; schema: JsonSchema },
): Promise<string | null> {
  const body: Record<string, unknown> = { model, messages, reasoning_effort: reasoningEffort };
  if (schema) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: schema.name, schema: schema.schema, strict: true },
    };
  }
  const completion = await request<ChatCompletion>("POST", "/chat/completions", body, timeoutMs);
  const content = completion?.choices?.[0]?.message?.content;
  return typeof content === "string" && content.trim() ? content : null;
}

function parseJson<T>(text: string | null): T | null {
  if (!text) return null;
  try {
    // Tolerate a fenced ```json block in case the model wraps its answer.
    const unfenced = text.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "");
    return JSON.parse(unfenced) as T;
  } catch {
    console.warn("[xai] response was not valid JSON:", text.slice(0, 200));
    return null;
  }
}

/** Ask the vision model about an image (a png/jpg data URL or https URL) and get JSON matching `schema` back. */
export async function visionJson<T>(opts: {
  image: string;
  prompt: string;
  schema: JsonSchema;
  schemaName: string;
  system?: string;
}): Promise<T | null> {
  const messages: ChatMessage[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({
    role: "user",
    content: [
      { type: "image_url", image_url: { url: opts.image, detail: "high" } },
      { type: "text", text: opts.prompt },
    ],
  });
  const text = await chat(VISION_MODEL, VISION_REASONING, messages, timeouts().vision, {
    name: opts.schemaName,
    schema: opts.schema,
  });
  return parseJson<T>(text);
}

/** Plain text chat. */
export async function chatText(opts: { system?: string; prompt: string }): Promise<string | null> {
  const messages: ChatMessage[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: opts.prompt });
  return chat(TEXT_MODEL, TEXT_REASONING, messages, timeouts().text);
}

/** Text chat with structured JSON output matching `schema`. */
export async function chatJson<T>(opts: {
  system?: string;
  prompt: string;
  schema: JsonSchema;
  schemaName: string;
}): Promise<T | null> {
  const messages: ChatMessage[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: opts.prompt });
  const text = await chat(TEXT_MODEL, TEXT_REASONING, messages, timeouts().text, {
    name: opts.schemaName,
    schema: opts.schema,
  });
  return parseJson<T>(text);
}

async function imagine(path: string, body: Record<string, unknown>, timeoutMs: number): Promise<string | null> {
  const result = await request<ImageResult>(
    "POST",
    path,
    { model: IMAGE_MODEL, n: 1, response_format: "url", ...IMAGE_OPTIONS, ...body },
    timeoutMs,
  );
  const image = result?.data?.[0];
  if (image?.url) return image.url;
  if (image?.b64_json) return `data:${image.mime_type ?? "image/jpeg"};base64,${image.b64_json}`;
  return null;
}

/** Generate one image from a prompt. Returns a temporary URL (or a data URL if the API sends base64). */
export function generateImage(
  prompt: string,
  options?: { aspect_ratio?: string },
  timeoutMs = timeouts().image,
): Promise<string | null> {
  return imagine("/images/generations", { prompt, ...options }, timeoutMs);
}

/** Re-imagine an existing image (a png/jpg data URL) following `prompt`. */
export function editImage(prompt: string, image: string, timeoutMs = timeouts().image): Promise<string | null> {
  return imagine("/images/edits", { prompt, image: { url: image } }, timeoutMs);
}

/** Start an image-to-video job. Returns its request id. There is no cancel, so only call this on a user's ask. */
export async function startVideo(imageUrl: string, prompt: string): Promise<string | null> {
  const job = await request<VideoJob>(
    "POST",
    "/videos/generations",
    { model: VIDEO_MODEL, image: { url: imageUrl }, prompt, ...VIDEO_OPTIONS },
    timeouts().video,
  );
  if (typeof job?.request_id !== "string") return null;
  // Video is billed when the clip is made, so count it now at list price ($0.02/s) for the budget.
  if (!job.usage) addCost(VIDEO_OPTIONS.duration * 0.02 * TICKS_PER_USD);
  return job.request_id;
}

export type VideoStatus = "pending" | "done" | "failed" | "expired";

/** Poll a video job. */
export async function getVideo(
  id: string,
): Promise<{ status: VideoStatus; progress: number | null; url: string | null } | null> {
  const job = await request<VideoJob>("GET", `/videos/${encodeURIComponent(id)}`, undefined, timeouts().video);
  if (!job) return null;
  const known: VideoStatus[] = ["pending", "done", "failed", "expired"];
  const status = known.includes(job.status as VideoStatus)
    ? (job.status as VideoStatus)
    : job.video?.url
      ? "done"
      : "pending";
  return {
    status,
    progress: typeof job.progress === "number" ? job.progress : null,
    url: typeof job.video?.url === "string" ? job.video.url : null,
  };
}
