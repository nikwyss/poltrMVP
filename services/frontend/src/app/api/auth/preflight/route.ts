import { NextRequest, NextResponse } from 'next/server';
import { appviewForwardHeaders } from '@/lib/appview-proxy';

const APPVIEW_URL = process.env.APPVIEW_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// Non-consuming preflight for /auth/verify. Reads the httpOnly initiator cookie
// and asks the appview whether this is the same browser that started the flow.
// The short code (when returned) is revealed only in the different-browser case.
export async function POST(request: NextRequest) {
  const body = await request.json();
  const initiatorSecret = request.cookies.get('poltr_auth_init')?.value;

  const res = await fetch(`${APPVIEW_URL}/xrpc/ch.poltr.auth.checkLink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...appviewForwardHeaders(request) },
    body: JSON.stringify({ token: body.token, initiatorSecret }),
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
