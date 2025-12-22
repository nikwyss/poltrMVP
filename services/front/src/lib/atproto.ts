import { ObjectParser } from '@pilcrowjs/object-parser';
import { joinURIBaseAndPath, readAllStreamWithLimit } from './utils';

export async function resolveATProtoHandle(handle: string): Promise<string> {
  // Use .well-known method to resolve handle to DID
  const wellknownResponse = await fetch(
    joinURIBaseAndPath(`https://${handle}`, '/.well-known/atproto-did'),
    { signal: AbortSignal.timeout(5000) }
  );
  
  if (wellknownResponse.status === 200 && wellknownResponse.body !== null) {
    const wellknownResultBytes = await readAllStreamWithLimit(wellknownResponse.body, 1024 * 32);
    return new TextDecoder().decode(wellknownResultBytes).trim();
  }

  throw new Error('Failed to resolve handle');
}

export async function resolveATProtoAuthorizationServer(did: string): Promise<string> {
  const response = await fetch(joinURIBaseAndPath(`https://plc.directory`, `/${did}`), {
    signal: AbortSignal.timeout(5000),
  });
  if (response.status === 200 && response.body !== null) {
    const didDocumentBytes = await readAllStreamWithLimit(response.body, 1024 * 32);
    const didDocument = JSON.parse(new TextDecoder().decode(didDocumentBytes));
    const parser = new ObjectParser(didDocument);
    const serviceEndpoint = parser.getString('service', '0', 'serviceEndpoint');
    if (!serviceEndpoint) {
      throw new Error('Invalid DID document');
    }
    return serviceEndpoint;
  }
  throw new Error('Failed to resolve authorization server');
}
