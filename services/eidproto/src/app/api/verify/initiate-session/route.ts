import { NextRequest, NextResponse } from 'next/server';
import { initiateSwiyuVerification } from '@/lib/swiyu';
import { createStateToken } from '@/lib/jwt';
import { validateEnv } from '@/lib/env';

/**
 * Initiate verification for OAuth-authenticated sessions.
 * This endpoint trusts the client-side OAuth session and only requires the DID.
 * Used by the eidproto frontend when the user is already authenticated via OAuth.
 */
export async function POST(request: NextRequest) {
  try {
    validateEnv();

    const body = await request.json().catch(() => ({}));
    const { did, pds_url, success_url, error_url } = body;

    if (!did) {
      return NextResponse.json(
        { error: 'did is required' },
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
    // Note: No access/refresh tokens stored - record will be written via service auth
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const stateToken = await createStateToken({
      verificationId: swiyuResponse.id,
      accessToken: '', // Not needed for session-based flow
      refreshToken: '', // Not needed for session-based flow
      did: did,
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
    console.error('Initiate session error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
