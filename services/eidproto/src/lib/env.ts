// Environment configuration for eidproto service

export const env = {
  // SWIYU eID verification
  EID_VERIFIER_API: process.env.EIDPROTO_EID_VERIFIER_API || process.env.APPVIEW_EID_VERIFIER_API || '',
  EID_TRUSTED_ISSUER_DID: process.env.EIDPROTO_EID_TRUSTED_ISSUER_DID || process.env.APPVIEW_EID_TRUSTED_ISSUER_DID || '',
  EID_HASH_SECRET: process.env.EIDPROTO_EID_HASH_SECRET || process.env.APPVIEW_EID_HASH_SECRET || '',

  // Signing key (Ed25519 seed, base64 encoded)
  SIGNING_KEY_SEED: process.env.EIDPROTO_SIGNING_KEY_SEED || process.env.APPVIEW_SIGNING_KEY_SEED || '',

  // Service identity
  SERVER_DID: process.env.EIDPROTO_SERVER_DID || 'did:web:eidproto.poltr.info',

  // JWT secret for state tokens (should be different from signing key)
  JWT_SECRET: process.env.EIDPROTO_JWT_SECRET || process.env.APPVIEW_EID_HASH_SECRET || '',
} as const;

export function validateEnv(): void {
  const required = [
    'EID_VERIFIER_API',
    'EID_TRUSTED_ISSUER_DID',
    'EID_HASH_SECRET',
    'SIGNING_KEY_SEED',
    'JWT_SECRET',
  ] as const;

  const missing = required.filter(key => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
