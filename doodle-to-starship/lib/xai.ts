import "server-only";

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

const VISION_TIMEOUT_MS = 30_000;
const TEXT_TIMEOUT_MS = 20_000;
const IMAGE_TIMEOUT_MS = 60_000;
const VIDEO_TIMEOUT_MS = 20_000;

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
  request_id?: string;
  status?: string;
  progress?: number;
  video?: { url?: string };
}

async function request<T>(method: "GET" | "POST", path: string, body: unknown, timeoutMs: number): Promise<T | null> {
  const key = process.env.XAI_API_KEY;
  if (!key) return null;
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
      console.warn(`[xai] ${method} ${path} -> ${res.status}: ${detail.slice(0, 300)}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[xai] ${method} ${path} failed:`, err instanceof Error ? err.message : err);
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
  const text = await chat(VISION_MODEL, VISION_REASONING, messages, VISION_TIMEOUT_MS, {
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
  return chat(TEXT_MODEL, TEXT_REASONING, messages, TEXT_TIMEOUT_MS);
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
  const text = await chat(TEXT_MODEL, TEXT_REASONING, messages, TEXT_TIMEOUT_MS, {
    name: opts.schemaName,
    schema: opts.schema,
  });
  return parseJson<T>(text);
}

async function imagine(path: string, body: Record<string, unknown>): Promise<string | null> {
  const result = await request<ImageResult>(
    "POST",
    path,
    { model: IMAGE_MODEL, n: 1, response_format: "url", ...IMAGE_OPTIONS, ...body },
    IMAGE_TIMEOUT_MS,
  );
  const image = result?.data?.[0];
  if (image?.url) return image.url;
  if (image?.b64_json) return `data:${image.mime_type ?? "image/jpeg"};base64,${image.b64_json}`;
  return null;
}

/** Generate one image from a prompt. Returns a temporary URL (or a data URL if the API sends base64). */
export function generateImage(prompt: string, options?: { aspect_ratio?: string }): Promise<string | null> {
  return imagine("/images/generations", { prompt, ...options });
}

/** Re-imagine an existing image (a png/jpg data URL) following `prompt`. */
export function editImage(prompt: string, image: string): Promise<string | null> {
  return imagine("/images/edits", { prompt, image: { url: image } });
}

/** Start an image-to-video job. Returns its request id. There is no cancel, so only call this on a user's ask. */
export async function startVideo(imageUrl: string, prompt: string): Promise<string | null> {
  const job = await request<VideoJob>(
    "POST",
    "/videos/generations",
    { model: VIDEO_MODEL, image: { url: imageUrl }, prompt, ...VIDEO_OPTIONS },
    VIDEO_TIMEOUT_MS,
  );
  return typeof job?.request_id === "string" ? job.request_id : null;
}

export type VideoStatus = "pending" | "done" | "failed" | "expired";

/** Poll a video job. */
export async function getVideo(
  id: string,
): Promise<{ status: VideoStatus; progress: number | null; url: string | null } | null> {
  const job = await request<VideoJob>("GET", `/videos/${encodeURIComponent(id)}`, undefined, VIDEO_TIMEOUT_MS);
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
