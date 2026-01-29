import { env } from './env';
import { v4 as uuidv4 } from 'uuid';

export interface SwiyuInitiateResponse {
  id: string;
  verification_url: string;
  verification_deeplink: string;
}

export type SwiyuStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'ERROR';

export interface SwiyuStatusResponse {
  state: SwiyuStatus;
  wallet_response?: {
    credential_subject_data?: {
      personal_administrative_number?: string;
      document_number?: string;
    };
  };
}

/**
 * Initiate SWIYU eID verification.
 * Returns verification URLs for QR code and deep link.
 */
export async function initiateSwiyuVerification(): Promise<SwiyuInitiateResponse> {
  const presentationRandomId = uuidv4().replace(/-/g, '');
  const inputId = uuidv4().replace(/-/g, '');

  const trustedIssuerDids = env.EID_TRUSTED_ISSUER_DID ? [env.EID_TRUSTED_ISSUER_DID] : [];

  const response = await fetch(env.EID_VERIFIER_API, {
    method: 'POST',
    headers: {
      Accept: '*/*',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      accepted_issuer_dids: trustedIssuerDids,
      jwt_secured_authorization_request: false,
      response_mode: 'direct_post',
      presentation_definition: {
        id: presentationRandomId,
        input_descriptors: [
          {
            id: inputId,
            format: {
              'vc+sd-jwt': {
                'sd-jwt_alg_values': ['ES256'],
                'kb-jwt_alg_values': ['ES256'],
              },
            },
            constraints: {
              fields: [
                {
                  path: ['$.vct'],
                  filter: {
                    type: 'string',
                    const: 'betaid-sdjwt',
                  },
                },
                { path: ['$.personal_administrative_number'] },
                { path: ['$.document_number'] },
              ],
            },
          },
        ],
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SWIYU initiation failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  return {
    id: data.id,
    verification_url: data.verification_url,
    verification_deeplink: data.verification_deeplink,
  };
}

/**
 * Poll SWIYU for verification status.
 */
export async function getSwiyuStatus(verificationId: string): Promise<SwiyuStatusResponse> {
  const response = await fetch(`${env.EID_VERIFIER_API}/${verificationId}`, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SWIYU status check failed: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

/**
 * Extract AHV number from SWIYU response.
 */
export function extractAhv(statusResponse: SwiyuStatusResponse): string | null {
  return statusResponse.wallet_response?.credential_subject_data?.personal_administrative_number || null;
}
