import { env } from './env';
import { signEidVerification } from './crypto';

export interface PdsSession {
  did: string;
  handle: string;
  accessJwt: string;
  refreshJwt: string;
}

export interface SessionInfo {
  did: string;
  handle: string;
  email?: string;
  didDoc?: {
    service?: Array<{ id: string; type: string; serviceEndpoint: string }>;
  };
}

/**
 * Extract PDS URL from DID document or use handle domain.
 */
export function extractPdsUrl(sessionInfo: SessionInfo): string {
  // Try to find PDS endpoint in DID document
  const pdsService = sessionInfo.didDoc?.service?.find(
    (s) => s.type === 'AtprotoPersonalDataServer' || s.id === '#atproto_pds'
  );

  if (pdsService?.serviceEndpoint) {
    // Remove protocol prefix
    return pdsService.serviceEndpoint.replace(/^https?:\/\//, '');
  }

  // Fallback: extract from handle (assumes handle@pds pattern)
  const handleParts = sessionInfo.handle.split('.');
  if (handleParts.length >= 2) {
    return handleParts.slice(-2).join('.');
  }

  throw new Error('Could not determine PDS URL from session');
}

/**
 * Verify a PDS access token by calling getSession.
 * Returns session info if valid, throws on error.
 */
export async function verifyPdsToken(
  accessToken: string,
  pdsUrl?: string
): Promise<SessionInfo & { pdsUrl: string }> {
  // If no PDS URL provided, we need to decode the JWT to find it
  // For now, require the PDS URL to be provided or use a default
  if (!pdsUrl) {
    throw new Error('PDS URL is required');
  }

  const response = await fetch(`https://${pdsUrl}/xrpc/com.atproto.server.getSession`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `PDS authentication failed: ${response.status}`);
  }

  const sessionInfo: SessionInfo = await response.json();
  return { ...sessionInfo, pdsUrl };
}

/**
 * Refresh an expired access token using the refresh token.
 */
export async function refreshPdsSession(
  refreshToken: string,
  pdsUrl: string
): Promise<{ accessJwt: string; refreshJwt: string }> {
  const response = await fetch(`https://${pdsUrl}/xrpc/com.atproto.server.refreshSession`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${refreshToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Token refresh failed: ${response.status}`);
  }

  return await response.json();
}

/**
 * Write the eID verification record to the user's PDS.
 */
export async function writeEidRecord(
  accessToken: string,
  refreshToken: string,
  did: string,
  pdsUrl: string,
  eidHash: string
): Promise<{ success: boolean; newAccessToken?: string; newRefreshToken?: string }> {
  const eidIssuer = env.EID_TRUSTED_ISSUER_DID;
  const verifiedBy = env.SERVER_DID;
  const verifiedAt = new Date().toISOString().replace('+00:00', 'Z');

  const signature = await signEidVerification(eidHash, eidIssuer, verifiedAt);

  const record = {
    $type: 'info.poltr.eidproto.verification',
    eidIssuer,
    eidHash,
    verifiedBy,
    verifiedAt,
    signature,
  };

  let currentAccessToken = accessToken;
  let currentRefreshToken = refreshToken;

  // First, check if token is valid
  const checkResponse = await fetch(`https://${pdsUrl}/xrpc/com.atproto.server.getSession`, {
    headers: {
      Authorization: `Bearer ${currentAccessToken}`,
    },
  });

  if (!checkResponse.ok) {
    const error = await checkResponse.json().catch(() => ({}));
    if (error.error === 'ExpiredToken') {
      // Try to refresh
      try {
        const refreshed = await refreshPdsSession(currentRefreshToken, pdsUrl);
        currentAccessToken = refreshed.accessJwt;
        currentRefreshToken = refreshed.refreshJwt;
      } catch {
        return { success: false };
      }
    } else {
      return { success: false };
    }
  }

  // Write the record
  const response = await fetch(`https://${pdsUrl}/xrpc/com.atproto.repo.putRecord`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${currentAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      repo: did,
      collection: 'info.poltr.eidproto.verification',
      rkey: 'self',
      record,
    }),
  });

  if (!response.ok) {
    console.error('Failed to write EID record:', await response.text());
    return { success: false };
  }

  return {
    success: true,
    newAccessToken: currentAccessToken !== accessToken ? currentAccessToken : undefined,
    newRefreshToken: currentRefreshToken !== refreshToken ? currentRefreshToken : undefined,
  };
}
