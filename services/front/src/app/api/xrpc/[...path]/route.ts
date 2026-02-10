import { NextRequest, NextResponse } from 'next/server';

const APPVIEW_URL = process.env.APPVIEW_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

async function proxyRequest(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const xrpcPath = path.join('/');
  const url = new URL(`${APPVIEW_URL}/xrpc/${xrpcPath}`);

  // Forward query parameters
  request.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  const headers: HeadersInit = {};

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

  return new NextResponse(responseBody, {
    status: res.status,
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'application/json',
    },
  });
}

export const GET = proxyRequest;
export const POST = proxyRequest;
