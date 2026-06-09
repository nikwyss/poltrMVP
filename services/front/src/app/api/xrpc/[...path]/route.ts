import { NextRequest, NextResponse } from 'next/server';
import { appviewForwardHeaders } from '@/lib/appview-proxy';

const APPVIEW_URL = process.env.APPVIEW_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

const EID_VERIFICATION_ENABLED = process.env.NEXT_PUBLIC_EID_VERIFICATION_ENABLED === 'true';

async function proxyRequest(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const xrpcPath = path.join('/');

  if (!EID_VERIFICATION_ENABLED && xrpcPath === 'ch.poltr.auth.initiateEidVerification') {
    return NextResponse.json(
      { error: 'feature_disabled', message: 'E-ID verification is not enabled' },
      { status: 403 },
    );
  }
  const url = new URL(`${APPVIEW_URL}/xrpc/${xrpcPath}`);

  // Forward query parameters
  request.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  // Reflect the in-app language switch: inject ?lang from the `locale` cookie
  // (set by the locale switcher) unless the caller already passed one. The
  // AppView prefers ?lang over Accept-Language, so this localizes arguments and
  // comments to the chosen UI language without touching every call site.
  if (!url.searchParams.has('lang')) {
    const locale = request.cookies.get('locale')?.value;
    if (locale) url.searchParams.set('lang', locale);
  }

  // Start with the real-client-IP forwarding headers (secret-gated) so the
  // AppView rate limiter keys per-client, not per frontend-pod.
  const headers: Record<string, string> = { ...appviewForwardHeaders(request) };

  // Forward content-type if present
  const contentType = request.headers.get('content-type');
  if (contentType) {
    headers['Content-Type'] = contentType;
  }

  // Read session cookie and forward as Bearer token
  const sessionToken = request.cookies.get('poltr_session')?.value;
  if (sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`;
  }

  const fetchInit: RequestInit = {
    method: request.method,
    headers,
  };

  // Forward body for non-GET requests
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    fetchInit.body = await request.text();
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), fetchInit);
  } catch (err) {
    return NextResponse.json(
      { error: 'service_unavailable', message: 'AppView is not reachable' },
      { status: 502 },
    );
  }

  const responseBody = await res.text();

  const response = new NextResponse(responseBody, {
    status: res.status,
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'application/json',
    },
  });

  // If the appview says the session is invalid/expired, clear the cookie
  // so the frontend stops sending a stale token.
  if (res.status === 401 && sessionToken) {
    response.cookies.set('poltr_session', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  }

  return response;
}

export const GET = proxyRequest;
export const POST = proxyRequest;
