import { NextRequest, NextResponse } from 'next/server';
import { verifyPdsToken } from '@/lib/pds';
import { initiateSwiyuVerification } from '@/lib/swiyu';
import { createStateToken } from '@/lib/jwt';
import { validateEnv } from '@/lib/env';

export async function POST(request: NextRequest) {
  try {
    // Validate environment
    validateEnv();

    // Extract Bearer token
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid Authorization header' },
        { status: 401 }
      );
    }
    const accessToken = authHeader.slice(7);

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const { refresh_token, pds_url, success_url, error_url } = body;

    if (!refresh_token) {
      return NextResponse.json(
        { error: 'refresh_token is required in request body' },
        { status: 400 }
      );
    }

    if (!pds_url) {
      return NextResponse.json(
        { error: 'pds_url is required in request body' },
        { status: 400 }
      );
    }

    if (!success_url || !error_url) {
      return NextResponse.json(
        { error: 'success_url and error_url are required' },
        { status: 400 }
      );
    }

    // Verify the PDS token
    let sessionInfo;
    try {
      sessionInfo = await verifyPdsToken(accessToken, pds_url);
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid PDS token', details: String(error) },
        { status: 401 }
      );
    }

    // Initiate SWIYU verification
    let swiyuResponse;
    try {
      swiyuResponse = await initiateSwiyuVerification();
    } catch (error) {
      return NextResponse.json(
        { error: 'Failed to initiate SWIYU verification', details: String(error) },
        { status: 502 }
      );
    }

    // Create state token for stateless flow
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const stateToken = await createStateToken({
      verificationId: swiyuResponse.id,
      accessToken,
      refreshToken: refresh_token,
      did: sessionInfo.did,
      pdsUrl: pds_url,
      successUrl: success_url,
      errorUrl: error_url,
      expiresAt,
    });

    return NextResponse.json({
      state_token: stateToken,
      verification_id: swiyuResponse.id,
      verification_url: swiyuResponse.verification_url,
      verification_deeplink: swiyuResponse.verification_deeplink,
      expires_at: expiresAt,
    });
  } catch (error) {
    console.error('Initiate error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
