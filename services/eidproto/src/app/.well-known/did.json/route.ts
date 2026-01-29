import { NextResponse } from 'next/server';
import { getPublicKeyMultibase } from '@/lib/crypto';
import { env } from '@/lib/env';

export async function GET() {
  try {
    const publicKeyMultibase = await getPublicKeyMultibase();
    const did = env.SERVER_DID || 'did:web:eidproto.poltr.info';

    const didDocument = {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/multikey/v1',
      ],
      id: did,
      verificationMethod: [
        {
          id: `${did}#key-1`,
          type: 'Multikey',
          controller: did,
          publicKeyMultibase: publicKeyMultibase,
        },
      ],
      authentication: [`${did}#key-1`],
      assertionMethod: [`${did}#key-1`],
    };

    return NextResponse.json(didDocument, {
      headers: {
        'Content-Type': 'application/did+json',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Failed to generate DID document:', error);
    return NextResponse.json(
      { error: 'Failed to generate DID document' },
      { status: 500 }
    );
  }
}
