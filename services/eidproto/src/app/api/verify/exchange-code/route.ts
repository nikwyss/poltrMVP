import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { env } from '@/lib/env';

interface SessionPayload {
  type: string;
  did: string;
  handle: string;
  accessToken: string;
  refreshToken: string;
  pdsUrl: string;
  successUrl: string;
  errorUrl: string;
}

/**
 * Exchange a verification session code for session data.
 * Called by the /verify page to get the tokens securely.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { code } = body;

    if (!code) {
      return NextResponse.json(
        { error: 'code is required' },
        { status: 400 }
      );
    }

    // Verify and decode the code
    const secret = new TextEncoder().encode(env.JWT_SECRET);

    let payload: SessionPayload;
    try {
      const result = await jwtVerify(code, secret);
      payload = result.payload as unknown as SessionPayload;
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid or expired code', details: String(error) },
        { status: 401 }
      );
    }

    if (payload.type !== 'verification_session') {
      return NextResponse.json(
        { error: 'Invalid code type' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      did: payload.did,
      handle: payload.handle,
      access_token: payload.accessToken,
      refresh_token: payload.refreshToken,
      pds_url: payload.pdsUrl,
      success_url: payload.successUrl,
      error_url: payload.errorUrl,
    });
  } catch (error) {
    console.error('Exchange code error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
