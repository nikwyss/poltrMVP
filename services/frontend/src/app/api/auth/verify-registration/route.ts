import { NextRequest, NextResponse } from 'next/server';
import { appviewForwardHeaders } from '@/lib/appview-proxy';

const APPVIEW_URL = process.env.APPVIEW_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export async function POST(request: NextRequest) {
  const body = await request.json();
  // Device binding: forward the initiator cookie (see verify-login).
  const initiatorSecret = request.cookies.get('poltr_auth_init')?.value;

  let res: Response;
  try {
    res = await fetch(`${APPVIEW_URL}/xrpc/ch.poltr.auth.verifyRegistration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...appviewForwardHeaders(request) },
      body: JSON.stringify({ ...body, initiatorSecret }),
    });
  } catch {
    return NextResponse.json(
      { error: 'service_unavailable', message: 'Could not reach the server, please try again later' },
      { status: 502 },
    );
  }

  let data: Record<string, unknown>;
  try {
    data = await res.json();
  } catch {
    return NextResponse.json(
      { error: 'invalid_response', message: 'Unexpected server response' },
      { status: 502 },
    );
  }

  if (!res.ok) {
    return NextResponse.json(data, { status: res.status });
  }

  const { session_token, expires_at, ...rest } = data;

  const response = NextResponse.json(rest);

  if (session_token) {
    // Derive cookie maxAge from appview's expires_at (single source of truth)
    const maxAge = expires_at
      ? Math.floor((new Date(expires_at as string).getTime() - Date.now()) / 1000)
      : 7 * 24 * 60 * 60;

    response.cookies.set('poltr_session', session_token as string, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge,
    });
  }

  return response;
}
