import { NextRequest, NextResponse } from 'next/server';
import { verifyStateToken } from '@/lib/jwt';
import { getSwiyuStatus, extractAhv } from '@/lib/swiyu';
import { hashAhv, signEidVerification } from '@/lib/crypto';
import { writeEidRecord } from '@/lib/pds';
import { validateEnv, env } from '@/lib/env';

export async function GET(request: NextRequest) {
  try {
    validateEnv();

    // Get state token from query params
    const stateToken = request.nextUrl.searchParams.get('state_token');
    if (!stateToken) {
      return NextResponse.json(
        { error: 'state_token query parameter is required' },
        { status: 400 }
      );
    }

    // Verify and decode state
    let state;
    try {
      state = await verifyStateToken(stateToken);
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid or expired state token', details: String(error) },
        { status: 401 }
      );
    }

    // Check SWIYU status
    let swiyuStatus;
    try {
      swiyuStatus = await getSwiyuStatus(state.verificationId);
    } catch (error) {
      return NextResponse.json(
        { error: 'Failed to check SWIYU status', details: String(error) },
        { status: 502 }
      );
    }

    if (swiyuStatus.state === 'PENDING') {
      return NextResponse.json({
        status: 'PENDING',
        message: 'Waiting for eID verification',
      });
    }

    if (swiyuStatus.state === 'FAILED' || swiyuStatus.state === 'ERROR') {
      return NextResponse.json({
        status: swiyuStatus.state,
        redirect_url: state.errorUrl,
        message: 'eID verification failed',
      });
    }

    if (swiyuStatus.state === 'SUCCESS') {
      // Extract and hash AHV
      const ahv = extractAhv(swiyuStatus);
      if (!ahv) {
        return NextResponse.json({
          status: 'ERROR',
          redirect_url: state.errorUrl,
          message: 'Missing AHV number in eID credential',
        });
      }

      const eidHash = hashAhv(ahv);

      // If we have tokens, write to PDS server-side
      if (state.accessToken && state.refreshToken) {
        const result = await writeEidRecord(
          state.accessToken,
          state.refreshToken,
          state.did,
          state.pdsUrl,
          eidHash
        );

        if (!result.success) {
          return NextResponse.json({
            status: 'ERROR',
            redirect_url: state.errorUrl,
            message: 'Failed to write verification record to PDS',
          });
        }

        return NextResponse.json({
          status: 'SUCCESS',
          redirect_url: state.successUrl,
          message: 'eID verification complete',
          eid_hash: eidHash,
        });
      }

      // No tokens - return signed record for client-side write
      const eidIssuer = env.EID_TRUSTED_ISSUER_DID;
      const verifiedBy = env.SERVER_DID;
      const verifiedAt = new Date().toISOString();
      const signature = await signEidVerification(eidHash, eidIssuer, verifiedAt);

      return NextResponse.json({
        status: 'SUCCESS_PENDING_WRITE',
        message: 'eID verification complete, record pending write',
        record: {
          $type: 'info.poltr.eidproto.verification',
          eidHash,
          eidIssuer,
          verifiedBy,
          verifiedAt,
          signature,
        },
        did: state.did,
        pds_url: state.pdsUrl,
        success_url: state.successUrl,
        error_url: state.errorUrl,
      });
    }

    return NextResponse.json({
      status: 'ERROR',
      redirect_url: state.errorUrl,
      message: `Unknown status: ${swiyuStatus.state}`,
    });
  } catch (error) {
    console.error('Status check error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: String(error) },
      { status: 500 }
    );
  }
}
