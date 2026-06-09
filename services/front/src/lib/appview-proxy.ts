// ─── Forward the real client IP to the AppView ───────────────────────────────
// All user XRPC traffic is proxied through these Next.js API routes, so the
// AppView would otherwise see every request as coming from THIS frontend pod's
// IP — collapsing every user into one rate-limit bucket. We forward the real
// browser IP so the AppView's limiter can key per-client.
//
// The IP is only honoured by the AppView when accompanied by the shared
// APPVIEW_PROXY_SECRET, so a caller hitting the AppView directly cannot spoof
// X-Poltr-Client-IP to forge or evade limits. See doc/SECURITY_AUTH.md #1.

import type { NextRequest } from "next/server";

const PROXY_SECRET = process.env.APPVIEW_PROXY_SECRET || "";

/** Real browser IP of the incoming request. Our ingress sets X-Forwarded-For /
 *  X-Real-IP on requests reaching this frontend; take the first (client) hop. */
export function clientIpFrom(request: NextRequest): string | null {
  const xff = request.headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip");
}

/** Headers to merge into the outbound fetch to the AppView so its rate limiter
 *  keys on the real client IP. Empty (no-op) when the IP is unknown (e.g. local
 *  dev with no proxy) or the secret is unset. */
export function appviewForwardHeaders(request: NextRequest): Record<string, string> {
  const ip = clientIpFrom(request);
  if (!ip || !PROXY_SECRET) return {};
  return {
    "X-Poltr-Client-IP": ip,
    "X-Poltr-Proxy-Secret": PROXY_SECRET,
  };
}
