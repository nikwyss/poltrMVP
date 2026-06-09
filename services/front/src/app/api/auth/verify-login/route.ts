import { NextRequest, NextResponse } from 'next/server';
import { appviewForwardHeaders } from '@/lib/appview-proxy';

const APPVIEW_URL = process.env.APPVIEW_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export async function POST(request: NextRequest) {
  const body = await request.json();

  const res = await fetch(`${APPVIEW_URL}/xrpc/ch.poltr.auth.verifyLogin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...appviewForwardHeaders(request) },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    return NextResponse.json(data, { status: res.status });
  }

  const { session_token, expires_at, ...rest } = data;

  const response = NextResponse.json(rest);

  if (session_token) {
    // Derive cookie maxAge from appview's expires_at (single source of truth)
    const maxAge = expires_at
      ? Math.floor((new Date(expires_at).getTime() - Date.now()) / 1000)
      : 7 * 24 * 60 * 60;

    response.cookies.set('poltr_session', session_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge,
    });
  }

  return response;
}
