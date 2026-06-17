import { NextRequest, NextResponse } from 'next/server';
import { appviewForwardHeaders } from '@/lib/appview-proxy';

const APPVIEW_URL = process.env.APPVIEW_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// Polling status for the waiting screen (browser A): authenticated | pending | gone.
// Forwards the session cookie (to detect a login completed in another tab) and the
// initiator cookie (to tell "still waiting" from "expired/used").
export async function POST(request: NextRequest) {
  const initiatorSecret = request.cookies.get('poltr_auth_init')?.value;
  const sessionToken = request.cookies.get('poltr_session')?.value;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...appviewForwardHeaders(request),
  };
  if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;

  const res = await fetch(`${APPVIEW_URL}/xrpc/ch.poltr.auth.waitStatus`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ initiatorSecret }),
  });

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data, { status: res.status });
}
