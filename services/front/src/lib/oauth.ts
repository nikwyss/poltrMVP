import { encodeBase64urlNoPadding } from '@oslojs/encoding';
import { generateRandomString } from './utils';

export interface OAuthState {
  state: string;
  codeVerifier: string;
  issuer: string;
}

export function generatePKCECodeVerifier(): string {
  const randomValues = new Uint8Array(32);
  crypto.getRandomValues(randomValues);
  return encodeBase64urlNoPadding(randomValues);
}

export function generateState(): string {
  return generateRandomString(32);
}

export async function generatePKCECodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return encodeBase64urlNoPadding(new Uint8Array(hash));
}
