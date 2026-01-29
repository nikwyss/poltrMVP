import { NextRequest, NextResponse } from 'next/server';
import { verifyEidSignature, decodeMultibasePublicKey } from '@/lib/crypto';

interface VerificationRecord {
  verifiedAt: string;
  eidHash: string;
  eidIssuer: string;
  verifiedBy: string;
  signature?: string;
}

interface PLCDocument {
  service?: Array<{
    id: string;
    type: string;
    serviceEndpoint: string;
  }>;
  verificationMethod?: Array<{
    id: string;
    type: string;
    publicKeyMultibase?: string;
  }>;
}

interface DidWebDocument {
  verificationMethod?: Array<{
    id: string;
    type: string;
    publicKeyMultibase?: string;
  }>;
}

async function resolvePdsUrl(did: string): Promise<string | null> {
  try {
    const plcResponse = await fetch(`https://plc.directory/${did}`);
    if (!plcResponse.ok) {
      return null;
    }
    const plcDoc: PLCDocument = await plcResponse.json();
    const pdsService = plcDoc.service?.find(
      (s) => s.id === '#atproto_pds' || s.type === 'AtprotoPersonalDataServer'
    );
    return pdsService?.serviceEndpoint || null;
  } catch {
    return null;
  }
}

async function resolvePublicKey(did: string): Promise<Uint8Array | null> {
  try {
    let didDoc: PLCDocument | DidWebDocument;

    if (did.startsWith('did:plc:')) {
      const response = await fetch(`https://plc.directory/${did}`);
      if (!response.ok) return null;
      didDoc = await response.json();
    } else if (did.startsWith('did:web:')) {
      // did:web:example.com -> https://example.com/.well-known/did.json
      // did:web:example.com:path -> https://example.com/path/did.json
      const parts = did.slice(8).split(':');
      const domain = parts[0];
      const path = parts.slice(1).join('/');
      const url = path
        ? `https://${domain}/${path}/did.json`
        : `https://${domain}/.well-known/did.json`;
      const response = await fetch(url);
      if (!response.ok) return null;
      didDoc = await response.json();
    } else {
      return null;
    }

    // Find verification method with Ed25519 key
    const verificationMethod = didDoc.verificationMethod?.find(
      (vm) =>
        vm.type === 'Multikey' ||
        vm.type === 'Ed25519VerificationKey2020' ||
        vm.type === 'Ed25519VerificationKey2018'
    );

    if (!verificationMethod?.publicKeyMultibase) {
      return null;
    }

    return decodeMultibasePublicKey(verificationMethod.publicKeyMultibase);
  } catch (err) {
    console.error('Failed to resolve public key:', err);
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const did = searchParams.get('did');

  if (!did) {
    return NextResponse.json({ error: 'Missing did parameter' }, { status: 400 });
  }

  // Resolve DID to PDS URL
  const pdsUrl = await resolvePdsUrl(did);
  if (!pdsUrl) {
    return NextResponse.json({ error: 'Could not resolve PDS for DID' }, { status: 404 });
  }

  try {
    // Fetch the verification record from the PDS
    const recordUrl = new URL(`${pdsUrl}/xrpc/com.atproto.repo.getRecord`);
    recordUrl.searchParams.set('repo', did);
    recordUrl.searchParams.set('collection', 'info.poltr.eidproto.verification');
    recordUrl.searchParams.set('rkey', 'self');

    const recordResponse = await fetch(recordUrl.toString());

    if (!recordResponse.ok) {
      return NextResponse.json({ verified: false });
    }

    const recordData = await recordResponse.json();
    const value = recordData.value;

    if (!value) {
      return NextResponse.json({ verified: false });
    }

    const record: VerificationRecord = {
      verifiedAt: value.verifiedAt || '',
      eidHash: value.eidHash || '',
      eidIssuer: value.eidIssuer || '',
      verifiedBy: value.verifiedBy || '',
      signature: value.signature || '',
    };

    // If no signature, record is not properly verified
    if (!record.signature) {
      return NextResponse.json({
        verified: false,
        record,
        reason: 'Missing signature',
      });
    }

    // Resolve the verifiedBy DID to get public key
    const publicKey = await resolvePublicKey(record.verifiedBy);
    if (!publicKey) {
      return NextResponse.json({
        verified: false,
        record,
        reason: 'Could not resolve verifier public key',
      });
    }

    // Verify the signature
    const isValid = await verifyEidSignature(
      record.eidHash,
      record.eidIssuer,
      record.verifiedAt,
      record.signature,
      publicKey
    );

    if (!isValid) {
      return NextResponse.json({
        verified: false,
        record,
        reason: 'Invalid signature',
      });
    }

    return NextResponse.json({
      verified: true,
      record,
    });
  } catch (error) {
    console.error('Error fetching verification record:', error);
    return NextResponse.json({ verified: false });
  }
}
