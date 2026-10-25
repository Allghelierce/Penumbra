import { connection } from "next/server";

// GET  -> { mode: "grok" | "browser" }: which voice the dock should use.
// POST -> { mode: "grok", token, expiresAt } with a short-lived token for the browser's
//         realtime WebSocket, or { mode: "browser" } when there's no XAI_API_KEY.
// The real key never leaves the server.

export async function GET() {
  await connection();
  return Response.json({ mode: process.env.XAI_API_KEY ? "grok" : "browser" });
}

export async function POST() {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return Response.json({ mode: "browser" });
  return Response.json({ mode: "browser", error: "Grok Voice token minting isn't wired up yet." }, { status: 503 });
}
