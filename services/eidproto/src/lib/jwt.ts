import * as jose from 'jose';
import { env } from './env';

export interface VerificationState {
  verificationId: string;
  accessToken: string;
  refreshToken: string;
  did: string;
  pdsUrl: string;
  successUrl: string;
  errorUrl: string;
  expiresAt: string;
}

const JWT_ALG = 'HS256';
const JWT_EXPIRATION = '15m'; // Verification should complete within 15 minutes

function getJwtSecret(): Uint8Array {
  return new TextEncoder().encode(env.JWT_SECRET);
}

/**
 * Create a signed JWT containing verification state.
 * This allows stateless operation without a database.
 */
export async function createStateToken(state: VerificationState): Promise<string> {
  const secret = getJwtSecret();

  return await new jose.SignJWT({ ...state })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime(JWT_EXPIRATION)
    .sign(secret);
}

/**
 * Verify and decode a state token.
 */
export async function verifyStateToken(token: string): Promise<VerificationState> {
  const secret = getJwtSecret();

  const { payload } = await jose.jwtVerify(token, secret);

  return {
    verificationId: payload.verificationId as string,
    accessToken: payload.accessToken as string,
    refreshToken: payload.refreshToken as string,
    did: payload.did as string,
    pdsUrl: payload.pdsUrl as string,
    successUrl: payload.successUrl as string,
    errorUrl: payload.errorUrl as string,
    expiresAt: payload.expiresAt as string,
  };
}
