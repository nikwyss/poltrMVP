import { NextRequest, NextResponse } from "next/server";

const APPVIEW_URL =
  process.env.APPVIEW_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3000";

export async function GET(request: NextRequest) {
  const sessionToken = request.cookies.get("poltr_session")?.value;

  if (!sessionToken) {
    return NextResponse.json({ authenticated: false });
  }

  // Validate token against the appview
  try {
    const res = await fetch(`${APPVIEW_URL}/xrpc/ch.poltr.auth.session`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });

    if (res.status === 401) {
      // Session is invalid/expired — clear the cookie
      const response = NextResponse.json({ authenticated: false });
      response.cookies.set("poltr_session", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });
      return response;
    }

    const data = await res.json().catch(() => ({}));
    return NextResponse.json({
      authenticated: true,
      did: data.did,
      handle: data.handle,
      displayName: data.displayName,
      canton: data.canton,
      color: data.color,
      mountainFullname: data.mountainFullname,
      height: data.height,
    });
  } catch {
    // AppView unreachable — assume still valid to avoid false logouts
    return NextResponse.json({ authenticated: true });
  }
}
