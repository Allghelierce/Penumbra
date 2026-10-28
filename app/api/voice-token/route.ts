import { connection } from "next/server";
import { paidCallsAllowed, recordEstimatedCost } from "@/lib/xai";

// GET  -> { mode: "grok" | "browser" }: which voice the dock should use.
// POST -> { mode: "grok", token, expiresAt }: a short-lived token for one Grok Voice realtime
//         session, or { mode: "browser" } when there's no XAI_API_KEY.
// The real key never leaves the server. With no key, or once the daily xAI budget is spent, both
// answer browser mode. Realtime voice bills about $0.08 a minute at xAI, so each token minted counts
// $0.08 (a session that closes within a minute) toward the budget.

const SESSION_ESTIMATE_USD = 0.08;

const CLIENT_SECRETS_URL = "https://api.x.ai/v1/realtime/client_secrets";

export async function GET() {
  await connection();
  return Response.json({ mode: paidCallsAllowed() ? "grok" : "browser" });
}

export async function POST() {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey || !paidCallsAllowed()) return Response.json({ mode: "browser" });
  try {
    const res = await fetch(CLIENT_SECRETS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      // A token opens one session and only has to last until the browser connects.
      body: JSON.stringify({ expires_after: { seconds: 300 } }),
      cache: "no-store",
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      return Response.json({ mode: "browser", error: `xAI token request failed (${res.status}): ${detail}` }, { status: 502 });
    }
    const secret = (await res.json()) as { value?: string; expires_at?: number };
    if (!secret.value) return Response.json({ mode: "browser", error: "xAI returned no token." }, { status: 502 });
    recordEstimatedCost(SESSION_ESTIMATE_USD);
    return Response.json({ mode: "grok", token: secret.value, expiresAt: secret.expires_at ?? null });
  } catch (err) {
    return Response.json({ mode: "browser", error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
