import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { appviewForwardHeaders } from '@/lib/appview-proxy';

const APPVIEW_URL = process.env.APPVIEW_URL || 'https://app.poltr.info';

export async function POST(request: NextRequest) {
  // Call AppView to delete all sessions for this user
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('poltr_session')?.value;

  if (sessionToken) {
    try {
      await fetch(`${APPVIEW_URL}/xrpc/ch.poltr.auth.logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionToken}`, ...appviewForwardHeaders(request) },
      });
    } catch {
      // Best-effort — clear cookie even if AppView is unreachable
    }
  }

  // Clear the session cookie
  const response = NextResponse.json({ ok: true });
  response.cookies.set('poltr_session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return response;
}
