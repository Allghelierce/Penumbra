import "server-only";

// Thin fetch wrappers around the xAI REST API. Every helper resolves to null on
// any failure (no key, timeout, HTTP error, bad JSON) so routes can fall back.

export const XAI_BASE_URL = "https://api.x.ai/v1";
export const VISION_MODEL = "grok-4";
export const TEXT_MODEL = "grok-4";
export const IMAGE_MODEL = "grok-imagine-image";

const VISION_TIMEOUT_MS = 30_000;
const TEXT_TIMEOUT_MS = 20_000;
const IMAGE_TIMEOUT_MS = 60_000;

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

interface ImageGeneration {
  data?: Array<{ url?: string; b64_json?: string }>;
}

async function post<T>(path: string, body: unknown, timeoutMs: number): Promise<T | null> {
  const key = process.env.XAI_API_KEY;
  if (!key) return null;
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
      console.warn(`[xai] ${path} -> ${res.status}: ${detail.slice(0, 300)}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[xai] ${path} failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

async function chat(
  model: string,
  messages: ChatMessage[],
  timeoutMs: number,
  schema?: { name: string; schema: JsonSchema },
): Promise<string | null> {
  const body: Record<string, unknown> = { model, messages, temperature: schema ? 0 : 0.7 };
  if (schema) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: schema.name, schema: schema.schema, strict: true },
    };
  }
  const completion = await post<ChatCompletion>("/chat/completions", body, timeoutMs);
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

/** Ask the vision model about an image (a data URL or https URL) and get JSON matching `schema` back. */
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
  const text = await chat(VISION_MODEL, messages, VISION_TIMEOUT_MS, {
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
  return chat(TEXT_MODEL, messages, TEXT_TIMEOUT_MS);
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
  const text = await chat(TEXT_MODEL, messages, TEXT_TIMEOUT_MS, {
    name: opts.schemaName,
    schema: opts.schema,
  });
  return parseJson<T>(text);
}

/** Generate one image and return its URL (or a data URL if the API returns base64). */
export async function generateImage(prompt: string): Promise<string | null> {
  const result = await post<ImageGeneration>(
    "/images/generations",
    { model: IMAGE_MODEL, prompt, n: 1, response_format: "url" },
    IMAGE_TIMEOUT_MS,
  );
  const image = result?.data?.[0];
  if (image?.url) return image.url;
  if (image?.b64_json) return `data:image/jpeg;base64,${image.b64_json}`;
  return null;
}
