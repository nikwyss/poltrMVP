import { NextRequest, NextResponse } from 'next/server';

const APPVIEW_URL = process.env.APPVIEW_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export async function POST(request: NextRequest) {
  const body = await request.json();

  const res = await fetch(`${APPVIEW_URL}/xrpc/ch.poltr.auth.verifyRegistration`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    return NextResponse.json(data, { status: res.status });
  }

  const { session_token, ...rest } = data;

  const response = NextResponse.json(rest);

  if (session_token) {
    response.cookies.set('poltr_session', session_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });
  }

  return response;
}
