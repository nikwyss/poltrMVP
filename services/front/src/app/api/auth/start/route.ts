import { NextRequest, NextResponse } from 'next/server';
import { appviewForwardHeaders } from '@/lib/appview-proxy';

const APPVIEW_URL = process.env.APPVIEW_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// Initiator cookie lifetime — matches the magic-link TTL (15 min). After it
// lapses the link simply falls through to the different-browser code path.
const INITIATOR_TTL = 15 * 60;

export async function POST(request: NextRequest) {
  const body = await request.json();

  const res = await fetch(`${APPVIEW_URL}/xrpc/ch.poltr.auth.start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...appviewForwardHeaders(request) },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    return NextResponse.json(data, { status: res.status });
  }

  // The appview returns the initiator secret in the body (appview & front are
  // different domains, so the cookie is set here on the poltr.ch origin). httpOnly
  // so JS can't read it; SHA-256 of it is stored server-side. See SECURITY_AUTH.md.
  const { initiatorSecret, ...rest } = data;
  const response = NextResponse.json(rest);

  if (initiatorSecret) {
    response.cookies.set('poltr_auth_init', initiatorSecret, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: INITIATOR_TTL,
    });
  }

  return response;
}
