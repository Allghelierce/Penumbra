import { NextResponse, type NextRequest } from "next/server";
import { clientIp, ruleFor, SlidingWindowLimiter } from "@/lib/rate-limit";

// Production guard rails: hide the dev pages and rate-limit the routes that spend xAI credits.
// Development is left alone so everyone testing against the shared dev server isn't throttled.

const limiter = new SlidingWindowLimiter();

export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV !== "production") return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (pathname === "/dev" || pathname.startsWith("/dev/")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const rule = ruleFor(request.method, pathname);
  if (!rule) return NextResponse.next();
  const result = limiter.hit(`${rule.name}:${clientIp(request.headers)}`, rule, Date.now());
  if (result.ok) return NextResponse.next();
  return NextResponse.json(
    { error: "rate-limited" },
    { status: 429, headers: { "Retry-After": String(result.retryAfterS) } },
  );
}

export const config = {
  matcher: ["/dev/:path*", "/api/read", "/api/review", "/api/render", "/api/replay", "/api/voice-token"],
};
