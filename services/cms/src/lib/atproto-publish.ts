/**
 * ATProto governance account creation for ballots, plus PDS record
 * publishing for content curated in the CMS (currently: imported
 * arguments from the Bundeskanzlei leaflet).
 *
 * Creates a PDS account, encrypts and stores credentials in the
 * AppView governance_accounts table.
 */

import crypto from 'node:crypto'
import pg from 'pg'
import nacl from 'tweetnacl'

// ---------------------------------------------------------------------------
// Config from env
// ---------------------------------------------------------------------------

function env(key: string, fallback?: string): string {
  const val = process.env[key] || fallback
  if (!val) throw new Error(`${key} not set`)
  return val
}

// ---------------------------------------------------------------------------
// PDS Admin API
// ---------------------------------------------------------------------------

async function pdsAdminCreateInvite(): Promise<string> {
  const pdsUrl = env('PDS_INTERNAL_URL')
  const adminPw = env('PDS_ADMIN_PASSWORD')
  const auth = Buffer.from(`admin:${adminPw}`).toString('base64')

  const resp = await fetch(`${pdsUrl}/xrpc/com.atproto.server.createInviteCode`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ useCount: 1 }),
  })

  if (!resp.ok) {
    throw new Error(`createInviteCode failed (${resp.status}): ${await resp.text()}`)
  }

  const data = (await resp.json()) as { code: string }
  return data.code
}

async function pdsCreateAccount(
  handle: string,
  password: string,
  email: string,
): Promise<{ did: string; accessJwt: string }> {
  const pdsUrl = env('PDS_INTERNAL_URL')
  const inviteCode = await pdsAdminCreateInvite()

  const resp = await fetch(`${pdsUrl}/xrpc/com.atproto.server.createAccount`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      handle,
      email,
      password,
      birthDate: '1970-01-01',
      inviteCode,
    }),
  })

  if (!resp.ok) {
    throw new Error(`createAccount failed (${resp.status}): ${await resp.text()}`)
  }

  const data = (await resp.json()) as { did: string; accessJwt: string }
  return { did: data.did, accessJwt: data.accessJwt }
}

// ---------------------------------------------------------------------------
// PLC resolution
// ---------------------------------------------------------------------------

async function waitForPlcResolution(did: string, timeout = 10000, interval = 2000): Promise<void> {
  const plcUrl = process.env.PLC_DIRECTORY_URL || 'https://plc.directory'
  const start = Date.now()

  while (Date.now() - start < timeout) {
    try {
      const resp = await fetch(`${plcUrl}/${did}`)
      if (resp.ok) return
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, interval))
  }
  console.warn(`DID ${did} not resolved on PLC after ${timeout}ms — continuing anyway`)
}

// ---------------------------------------------------------------------------
// Password encryption (NaCl SecretBox, same as Python pds_creds.py)
// ---------------------------------------------------------------------------

function encryptPassword(password: string): { ciphertext: Buffer; nonce: Buffer } {
  const keyB64 = env('APPVIEW_PDS_CREDS_MASTER_KEY_B64')
  const key = Buffer.from(keyB64, 'base64')

  if (key.length !== 32) {
    throw new Error('Master key must be 32 bytes')
  }

  const nonce = nacl.randomBytes(24)
  const messageBytes = Buffer.from(password, 'utf-8')
  const encrypted = nacl.secretbox(messageBytes, nonce, key)

  return {
    ciphertext: Buffer.from(encrypted),
    nonce: Buffer.from(nonce),
  }
}

// ---------------------------------------------------------------------------
// AppView DB: store governance account
// ---------------------------------------------------------------------------

async function storeGovernanceAccount(
  did: string,
  handle: string,
  ballotRkey: string,
  ciphertext: Buffer,
  nonce: Buffer,
): Promise<void> {
  const dbUrl = env('APPVIEW_POSTGRES_URL')
  const client = new pg.Client({ connectionString: dbUrl })

  try {
    await client.connect()
    await client.query(
      `INSERT INTO auth.governance_accounts (did, handle, ballot_rkey, pw_ciphertext, pw_nonce)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (ballot_rkey) DO NOTHING`,
      [did, handle, ballotRkey, ciphertext, nonce],
    )
  } finally {
    await client.end()
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function generatePassword(length = 32): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  return Array.from(crypto.randomBytes(length))
    .map((b) => chars[b % chars.length])
    .join('')
}

export async function publishGovernanceAccount(
  ballotId: string,
): Promise<{ did: string; handle: string }> {
  const domain = env('PDS_PUBLIC_HANDLE', 'id.poltr.ch')
  const handle = `ballot-${ballotId}.${domain}`
  const password = generatePassword()
  const email = `ballot-${ballotId}@poltr.ch`

  // Create PDS account
  const { did } = await pdsCreateAccount(handle, password, email)

  // Wait for PLC
  await waitForPlcResolution(did)

  // Encrypt and store credentials
  const { ciphertext, nonce } = encryptPassword(password)
  await storeGovernanceAccount(did, handle, ballotId, ciphertext, nonce)

  return { did, handle }
}

// ---------------------------------------------------------------------------
// Imported argument publishing
// ---------------------------------------------------------------------------

const ARGUMENT_NSID = 'app.ch.poltr.ballot.argument'

function decryptGovernancePassword(ciphertext: Buffer, nonce: Buffer): string {
  const keyB64 = env('APPVIEW_PDS_CREDS_MASTER_KEY_B64')
  const key = Buffer.from(keyB64, 'base64')
  if (key.length !== 32) throw new Error('Master key must be 32 bytes')

  const opened = nacl.secretbox.open(
    new Uint8Array(ciphertext),
    new Uint8Array(nonce),
    new Uint8Array(key),
  )
  if (!opened) throw new Error('Failed to decrypt governance password')
  return Buffer.from(opened).toString('utf-8')
}

async function loadGovernanceCreds(ballotRkey: string): Promise<{
  did: string
  handle: string
  password: string
}> {
  const dbUrl = env('APPVIEW_POSTGRES_URL')
  const client = new pg.Client({ connectionString: dbUrl })

  try {
    await client.connect()
    const res = await client.query<{
      did: string
      handle: string
      pw_ciphertext: Buffer
      pw_nonce: Buffer
    }>(
      `SELECT did, handle, pw_ciphertext, pw_nonce
       FROM auth.governance_accounts
       WHERE ballot_rkey = $1`,
      [ballotRkey],
    )
    if (!res.rows.length) {
      throw new Error(`No governance account for ballot rkey ${ballotRkey}`)
    }
    const { did, handle, pw_ciphertext, pw_nonce } = res.rows[0]
    const password = decryptGovernancePassword(pw_ciphertext, pw_nonce)
    return { did, handle, password }
  } finally {
    await client.end()
  }
}

async function pdsCreateSession(
  did: string,
  password: string,
): Promise<{ accessJwt: string }> {
  const pdsUrl = env('PDS_INTERNAL_URL')
  const resp = await fetch(`${pdsUrl}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: did, password }),
  })
  if (!resp.ok) {
    throw new Error(`createSession failed (${resp.status}): ${await resp.text()}`)
  }
  return resp.json() as Promise<{ accessJwt: string }>
}

async function pdsCreateRecord(
  did: string,
  accessJwt: string,
  collection: string,
  record: Record<string, unknown>,
): Promise<{ uri: string; cid: string }> {
  const pdsUrl = env('PDS_INTERNAL_URL')
  const resp = await fetch(`${pdsUrl}/xrpc/com.atproto.repo.createRecord`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessJwt}`,
    },
    body: JSON.stringify({ repo: did, collection, record }),
  })
  if (!resp.ok) {
    throw new Error(`createRecord failed (${resp.status}): ${await resp.text()}`)
  }
  return resp.json() as Promise<{ uri: string; cid: string }>
}

type ImportedArgumentDoc = {
  id: string | number
  ballot: unknown
  sourceType: 'official' | 'organization'
  type: 'PRO' | 'CONTRA'
  title: string
  body: string
  documentRef?: string | null
  section?: string | null
}

/**
 * Resolve the ballot rkey from a Payload relationship value. Payload may
 * return either the raw ID or the populated document depending on depth.
 *
 * `payload` is typed loosely on purpose: the Payload-generated types
 * (`payload-types.ts`) keep changing as collections are added, and the
 * tight typing makes this helper hard to reuse.
 */
async function resolveBallotRkey(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any,
  ballotRef: unknown,
): Promise<string> {
  if (typeof ballotRef === 'object' && ballotRef !== null) {
    const ref = ballotRef as { rkey?: string; id?: string | number }
    if (ref.rkey) return ref.rkey
    if (ref.id !== undefined) {
      const b = await payload.findByID({ collection: 'ballots', id: ref.id })
      if (!b?.rkey) throw new Error(`Ballot ${ref.id} has no rkey`)
      return b.rkey as string
    }
  }
  if (typeof ballotRef === 'string' || typeof ballotRef === 'number') {
    const b = await payload.findByID({ collection: 'ballots', id: ballotRef })
    if (!b?.rkey) throw new Error(`Ballot ${ballotRef} has no rkey`)
    return b.rkey as string
  }
  throw new Error('Unable to resolve ballot reference')
}

/**
 * Publish an imported argument (from the CMS) to its ballot's governance
 * PDS account. Returns the AT URI + CID of the created record.
 */
export async function publishImportedArgument(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any,
  doc: ImportedArgumentDoc,
): Promise<{ uri: string; cid: string }> {
  const ballotRkey = await resolveBallotRkey(payload, doc.ballot)
  const { did, password } = await loadGovernanceCreds(ballotRkey)

  let source: Record<string, unknown>
  if (doc.sourceType === 'official') {
    source = { $type: `${ARGUMENT_NSID}#sourceOfficial` }
    if (doc.documentRef) source.documentRef = doc.documentRef
    if (doc.section) source.section = doc.section
  } else {
    // 'organization' is reserved but not yet exposed in the CMS UI.
    throw new Error(
      `sourceType '${doc.sourceType}' is not yet supported by publishImportedArgument`,
    )
  }

  const record = {
    $type: ARGUMENT_NSID,
    title: doc.title,
    body: doc.body,
    type: doc.type,
    ballot: ballotRkey,
    createdAt: new Date().toISOString(),
    source,
  }

  const { accessJwt } = await pdsCreateSession(did, password)
  return pdsCreateRecord(did, accessJwt, ARGUMENT_NSID, record)
}
