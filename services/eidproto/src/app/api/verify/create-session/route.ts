import { NextRequest, NextResponse } from 'next/server';
import { verifyPdsToken } from '@/lib/pds';
import { SignJWT } from 'jose';
import { env } from '@/lib/env';

/**
 * Create a short-lived verification session code.
 * External apps POST tokens here, receive a code to redirect users with.
 * Tokens never appear in URLs.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { access_token, refresh_token, pds_url, success_url, error_url } = body;

    if (!access_token) {
      return NextResponse.json(
        { error: 'access_token is required' },
        { status: 400 }
      );
    }

    if (!refresh_token) {
      return NextResponse.json(
        { error: 'refresh_token is required' },
        { status: 400 }
      );
    }

    if (!pds_url) {
      return NextResponse.json(
        { error: 'pds_url is required' },
        { status: 400 }
      );
    }

    if (!success_url || !error_url) {
      return NextResponse.json(
        { error: 'success_url and error_url are required' },
        { status: 400 }
      );
    }

    // Validate the token against the PDS
    let sessionInfo;
    try {
      sessionInfo = await verifyPdsToken(access_token, pds_url);
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid PDS token', details: String(error) },
        { status: 401 }
      );
    }

    // Create a short-lived session code (5 minutes)
    const secret = new TextEncoder().encode(env.JWT_SECRET);
    const code = await new SignJWT({
      type: 'verification_session',
      did: sessionInfo.did,
      handle: sessionInfo.handle,
      accessToken: access_token,
      refreshToken: refresh_token,
      pdsUrl: pds_url,
      successUrl: success_url,
      errorUrl: error_url,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(secret);

    return NextResponse.json({
      code,
      expires_in: 300, // 5 minutes
      redirect_url: `/verify?code=${encodeURIComponent(code)}`,
    });
  } catch (error) {
    console.error('Create session error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
