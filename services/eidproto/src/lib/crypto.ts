import { createHash } from 'crypto';
import * as ed from '@noble/ed25519';
import bs58 from 'bs58';
import { env } from './env';

/**
 * Hash the AHV number with the secret salt.
 * Same algorithm as Python appview: sha256(ahv + secret).hexdigest()
 */
export function hashAhv(ahv: string): string {
  const message = `${ahv}${env.EID_HASH_SECRET}`;
  return createHash('sha256').update(message, 'utf-8').digest('hex');
}

/**
 * Get the Ed25519 private key from the seed.
 */
function getPrivateKey(): Uint8Array {
  const seed = Buffer.from(env.SIGNING_KEY_SEED, 'base64');
  if (seed.length !== 32) {
    throw new Error('Signing key seed must be 32 bytes');
  }
  return new Uint8Array(seed);
}

/**
 * Sign an eID verification record.
 * Signs the canonical message: "eidHash|eidIssuer|verifiedAt"
 * Returns base64-encoded signature.
 */
export async function signEidVerification(
  eidHash: string,
  eidIssuer: string,
  verifiedAt: string
): Promise<string> {
  const privateKey = getPrivateKey();
  const message = new TextEncoder().encode(`${eidHash}|${eidIssuer}|${verifiedAt}`);
  const signature = await ed.signAsync(message, privateKey);
  return Buffer.from(signature).toString('base64');
}

/**
 * Get the public key in multibase format (for DID document).
 * Multicodec prefix for Ed25519 public key: 0xed01
 */
export async function getPublicKeyMultibase(): Promise<string> {
  const privateKey = getPrivateKey();
  const publicKey = await ed.getPublicKeyAsync(privateKey);

  // Multicodec prefix for Ed25519 public key
  const prefixed = new Uint8Array([0xed, 0x01, ...publicKey]);

  // Base58btc encoding with 'z' prefix (multibase)
  return 'z' + bs58.encode(prefixed);
}

/**
 * Decode a multibase public key to raw bytes.
 * Expects 'z' prefix (base58btc) with ed25519 multicodec prefix (0xed01).
 */
export function decodeMultibasePublicKey(multibase: string): Uint8Array {
  if (!multibase.startsWith('z')) {
    throw new Error('Expected multibase with z prefix (base58btc)');
  }
  const decoded = bs58.decode(multibase.slice(1));
  // Check for ed25519 multicodec prefix
  if (decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new Error('Expected ed25519 multicodec prefix (0xed01)');
  }
  return decoded.slice(2);
}

/**
 * Verify an eID verification signature.
 * Returns true if signature is valid.
 */
export async function verifyEidSignature(
  eidHash: string,
  eidIssuer: string,
  verifiedAt: string,
  signature: string,
  publicKey: Uint8Array
): Promise<boolean> {
  try {
    const message = new TextEncoder().encode(`${eidHash}|${eidIssuer}|${verifiedAt}`);
    const signatureBytes = Buffer.from(signature, 'base64');
    return await ed.verifyAsync(signatureBytes, message, publicKey);
  } catch {
    return false;
  }
}
