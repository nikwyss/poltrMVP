import { NextRequest, NextResponse } from 'next/server';

/**
 * REST proxy to the AppView basis-app layer (CMS-backed, NOT ATProto).
 *
 * Pattern mirrors `app/api/xrpc/[...path]` but forwards to `/api/<path>` on
 * the AppView instead of `/xrpc/<path>`. The URL split makes the
 * architecture visible: `/api/xrpc/*` = deliberation layer (ATProto),
 * `/api/poltr/*` = basis-app (e.g. ballots).
 */

const APPVIEW_URL = process.env.APPVIEW_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

async function proxyRequest(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const restPath = path.join('/');
  const url = new URL(`${APPVIEW_URL}/api/${restPath}`);

  // Forward query parameters (including `?lang=<code>`).
  request.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  const headers: HeadersInit = {};

  const contentType = request.headers.get('content-type');
  if (contentType) {
    headers['Content-Type'] = contentType;
  }

  // Read session cookie and forward as Bearer token (same scheme as xrpc proxy).
  const sessionToken = request.cookies.get('poltr_session')?.value;
  if (sessionToken) {
    headers['Authorization'] = `Bearer ${sessionToken}`;
  }

  // Forward Accept-Language so the AppView can fall back on the header when
  // no `?lang=` was provided.
  const acceptLanguage = request.headers.get('accept-language');
  if (acceptLanguage) {
    headers['Accept-Language'] = acceptLanguage;
  }

  const fetchInit: RequestInit = {
    method: request.method,
    headers,
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    fetchInit.body = await request.text();
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), fetchInit);
  } catch (_err) {
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
