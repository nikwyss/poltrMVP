/**
 * ATProto governance account creation for ballots.
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
