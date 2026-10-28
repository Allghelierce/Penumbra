import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

// Thin fetch wrappers around the xAI REST API. Every helper resolves to null on
// any failure (no key, timeout, HTTP error, bad JSON) so routes can fall back.

export const XAI_BASE_URL = "https://api.x.ai/v1";
/** grok-4.7 timed out the live budget even at low effort. Reading a doodle into a schema needs no reasoning. */
export const VISION_MODEL = "grok-4.3";
const VISION_REASONING = "none";
export const TEXT_MODEL = "grok-4.3";
const TEXT_REASONING = "none";

/**
 * Live-demo budgets in ms; a slow call is worse than a fallback. Override with XAI_VISION_TIMEOUT_MS
 * and XAI_TEXT_TIMEOUT_MS. Read per call so .env edits apply.
 */
export function timeouts() {
  return {
    vision: envNumber("XAI_VISION_TIMEOUT_MS", 8_000),
    text: envNumber("XAI_TEXT_TIMEOUT_MS", 6_000),
  };
}

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export type XaiErrorKind = "auth" | "rate-limit" | "server" | "bad-request" | "timeout" | "network" | "budget";

/** Paid calls stop for the rest of the UTC day once metered spend reaches this (XAI_DAILY_BUDGET_USD). */
export function dailyBudgetUsd(): number {
  // 0 is allowed and means "no paid calls at all".
  const value = Number(process.env.XAI_DAILY_BUDGET_USD);
  return process.env.XAI_DAILY_BUDGET_USD && Number.isFinite(value) && value >= 0 ? value : 15;
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

/** False with no key, or once today's metered spend has reached the daily budget. */
export function paidCallsAllowed(): boolean {
  return hasXai() && spentTodayUsd() < dailyBudgetUsd();
}

/** Count a cost xAI bills outside these helpers (e.g. a Grok Voice session) toward today's budget. */
export function recordEstimatedCost(usd: number) {
  addCost(usd * TICKS_PER_USD);
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

async function request<T>(path: string, body: unknown, timeoutMs: number): Promise<T | null> {
  // Name the model in logs and /api/xai-status so a slow vision read can be told from a slow rewrite.
  const model = (body as { model?: unknown } | undefined)?.model;
  const label = typeof model === "string" ? `${path} (${model})` : path;
  const key = process.env.XAI_API_KEY;
  if (!key) return null;
  // Spend brake: past the daily budget, calls fall back like no-key mode.
  if (spentTodayUsd() >= dailyBudgetUsd()) {
    recordError(label, null, "budget", `daily xAI budget of $${dailyBudgetUsd()} reached`);
    return null;
  }
  try {
    const res = await fetch(`${XAI_BASE_URL}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      recordError(label, res.status, kindOf(res.status, detail), detail);
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
    recordError(label, null, kind, `${err instanceof Error ? err.message : String(err)} after ${timeoutMs} ms`);
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
  const completion = await request<ChatCompletion>("/chat/completions", body, timeoutMs);
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
      // "auto" rather than "high": a napkin doodle doesn't need full-resolution tiles, and it's faster.
      { type: "image_url", image_url: { url: opts.image, detail: "auto" } },
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

/**
 * xAI bills TTS per input character. The rate wasn't in our docs copy (the price table renders
 * client-side), so this meters a conservative $30 per million characters until it's confirmed.
 */
const TTS_USD_PER_CHAR = 30 / 1_000_000;
const TTS_TIMEOUT_MS = 10_000;

/** Speak `text` with an xAI voice. Returns MP3 bytes, or null (no key, no budget, error or timeout). */
export async function synthesize(text: string, voiceId: string, speed = 1): Promise<Uint8Array | null> {
  const key = process.env.XAI_API_KEY;
  if (!key) return null;
  const label = `/tts (${voiceId})`;
  if (!paidCallsAllowed()) {
    recordError(label, null, "budget", `daily xAI budget of $${dailyBudgetUsd()} reached`);
    return null;
  }
  try {
    const res = await fetch(`${XAI_BASE_URL}/tts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        voice_id: voiceId,
        language: "en",
        speed,
        output_format: { codec: "mp3", sample_rate: 44100, bit_rate: 128000 },
      }),
      signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      recordError(label, res.status, kindOf(res.status, detail), detail);
      return null;
    }
    const audio = new Uint8Array(await res.arrayBuffer());
    addCost(text.length * TTS_USD_PER_CHAR * TICKS_PER_USD);
    health.lastOkAt = new Date().toISOString();
    return audio.length > 0 ? audio : null;
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    const kind = name === "TimeoutError" || name === "AbortError" ? "timeout" : "network";
    recordError(label, null, kind, `${err instanceof Error ? err.message : String(err)} after ${TTS_TIMEOUT_MS} ms`);
    return null;
  }
}
