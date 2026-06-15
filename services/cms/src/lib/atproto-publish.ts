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

export class HandleAlreadyTakenError extends Error {
  constructor(public handle: string) {
    super(`Handle ${handle} ist auf dem PDS bereits vergeben`)
    this.name = 'HandleAlreadyTakenError'
  }
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
    const body = await resp.text()
    if (/HandleNotAvailable|handle.*(taken|already)/i.test(body)) {
      throw new HandleAlreadyTakenError(handle)
    }
    throw new Error(`createAccount failed (${resp.status}): ${body}`)
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
  // Dots in the rkey (e.g. counter-proposals "133.3") would create multi-label
  // handles that break the *.id.poltr.ch wildcard and ATProto handle rules.
  const handleSlug = ballotId.replace(/\./g, '-')
  const handle = `ballot-${handleSlug}.${domain}`
  const password = generatePassword()
  const email = `ballot-${handleSlug}@poltr.ch`

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

// Mirror of services/appview/src/core/languages.py / indexer/languages.js —
// keep the env name aligned so a single ConfigMap drives all three services.
const SUPPORTED_LANGUAGES = (process.env.POLTR_LANGUAGES || 'de,fr,it,rm,en')
  .split(',')
  .map((c) => c.trim())
  .filter(Boolean)

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

async function pdsPutRecord(
  did: string,
  accessJwt: string,
  collection: string,
  rkey: string,
  record: Record<string, unknown>,
): Promise<{ uri: string; cid: string }> {
  const pdsUrl = env('PDS_INTERNAL_URL')
  const resp = await fetch(`${pdsUrl}/xrpc/com.atproto.repo.putRecord`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessJwt}`,
    },
    body: JSON.stringify({ repo: did, collection, rkey, record }),
  })
  if (!resp.ok) {
    throw new Error(`putRecord failed (${resp.status}): ${await resp.text()}`)
  }
  return resp.json() as Promise<{ uri: string; cid: string }>
}

async function pdsDeleteRecord(
  did: string,
  accessJwt: string,
  collection: string,
  rkey: string,
): Promise<void> {
  const pdsUrl = env('PDS_INTERNAL_URL')
  const resp = await fetch(`${pdsUrl}/xrpc/com.atproto.repo.deleteRecord`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessJwt}`,
    },
    body: JSON.stringify({ repo: did, collection, rkey }),
  })
  if (!resp.ok) {
    throw new Error(`deleteRecord failed (${resp.status}): ${await resp.text()}`)
  }
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
  originLanguage?: string | null
  createdAt?: string | null
  pdsUri?: string | null
}

type LocalizedArgumentSnapshot = {
  title: string | null
  body: string | null
}

/**
 * Load the (title, body) pair for a given locale **without** falling back to
 * defaultLocale — we need to know precisely which locales the editor actually
 * filled in. Used to assemble the `translations[]` array.
 */
async function loadLocaleSnapshot(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any,
  id: string | number,
  locale: string,
): Promise<LocalizedArgumentSnapshot> {
  const doc = await payload.findByID({
    collection: 'imported-arguments',
    id,
    locale,
    fallbackLocale: false,
  })
  return {
    title: doc?.title ?? null,
    body: doc?.body ?? null,
  }
}

/** Build the `source` union for an imported argument record. */
function buildArgumentSource(doc: ImportedArgumentDoc): Record<string, unknown> {
  if (doc.sourceType === 'official') {
    const source: Record<string, unknown> = {
      $type: `${ARGUMENT_NSID}#sourceOfficial`,
    }
    if (doc.documentRef) source.documentRef = doc.documentRef
    if (doc.section) source.section = doc.section
    return source
  }
  // 'organization' is reserved but not yet exposed in the CMS UI.
  throw new Error(
    `sourceType '${doc.sourceType}' is not yet supported for imported arguments`,
  )
}

/**
 * Compose the full argument record.
 *
 * - `createdAt` stays stable across edits (uses the CMS doc's createdAt) so
 *   the indexed created_at never drifts.
 * - Top-level `title`/`body` come from the `originLanguage` locale; that
 *   locale also goes into `langs: [origin]` (Bluesky-compatible).
 * - All other SUPPORTED_LANGUAGES that have non-empty (title, body) for this
 *   document are emitted as `translations: [{lang, title, body, source:'manual', translatedAt}]`.
 */
async function buildArgumentRecord(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any,
  doc: ImportedArgumentDoc,
  ballotRkey: string,
): Promise<Record<string, unknown>> {
  const origin = doc.originLanguage || 'de-CH'
  const originSnap = await loadLocaleSnapshot(payload, doc.id, origin)
  const originTitle = originSnap.title ?? doc.title
  const originBody = originSnap.body ?? doc.body

  const now = new Date().toISOString()
  const translations: Array<Record<string, unknown>> = []

  // Locale-Liste aus der Payload-Config (Single Source of Truth). Fällt auf die
  // env-basierte SUPPORTED_LANGUAGES zurück, wenn keine Localization aktiv ist.
  // Wichtig: nur die tatsächlich konfigurierten Locale-Codes (z.B. de-CH, en-GB)
  // liefern beim findByID echte Übersetzungen — falsche Codes ergäben nie eine.
  const configuredLocales: string[] = payload?.config?.localization?.locales
    ? payload.config.localization.locales.map((l: { code?: string } | string) =>
        typeof l === 'string' ? l : (l.code as string),
      )
    : SUPPORTED_LANGUAGES

  for (const lang of configuredLocales) {
    if (lang === origin) continue
    const snap = await loadLocaleSnapshot(payload, doc.id, lang)
    if (!snap.title || !snap.body) continue
    if (snap.title === originTitle && snap.body === originBody) continue
    translations.push({
      lang,
      title: snap.title,
      body: snap.body,
      source: 'manual',
      translatedAt: now,
    })
  }

  const record: Record<string, unknown> = {
    $type: ARGUMENT_NSID,
    title: originTitle,
    body: originBody,
    type: doc.type,
    ballot: ballotRkey,
    langs: [origin],
    createdAt: doc.createdAt || now,
    source: buildArgumentSource(doc),
  }
  if (translations.length) record.translations = translations
  return record
}

/** Extract the rkey from an AT URI (at://did/collection/rkey). */
function rkeyFromUri(uri: string): string {
  const rkey = uri.split('/').pop()
  if (!rkey) throw new Error(`Cannot extract rkey from URI: ${uri}`)
  return rkey
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
  const record = await buildArgumentRecord(payload, doc, ballotRkey)

  const { accessJwt } = await pdsCreateSession(did, password)
  return pdsCreateRecord(did, accessJwt, ARGUMENT_NSID, record)
}

/**
 * Re-publish an already-published imported argument after a CMS edit
 * (putRecord at its existing rkey). Keeps the public PDS record in sync
 * with the CMS source of truth. Requires `doc.pdsUri`.
 */
export async function updateImportedArgument(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any,
  doc: ImportedArgumentDoc,
): Promise<{ uri: string; cid: string }> {
  if (!doc.pdsUri) throw new Error('updateImportedArgument requires pdsUri')
  const ballotRkey = await resolveBallotRkey(payload, doc.ballot)
  const { did, password } = await loadGovernanceCreds(ballotRkey)
  const record = await buildArgumentRecord(payload, doc, ballotRkey)

  const { accessJwt } = await pdsCreateSession(did, password)
  return pdsPutRecord(did, accessJwt, ARGUMENT_NSID, rkeyFromUri(doc.pdsUri), record)
}

/**
 * Remove a published imported argument from the PDS (deleteRecord) so it
 * stops being served publicly. Requires `doc.pdsUri`.
 */
export async function deleteImportedArgument(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any,
  doc: ImportedArgumentDoc,
): Promise<void> {
  if (!doc.pdsUri) return // never published — nothing to remove
  const ballotRkey = await resolveBallotRkey(payload, doc.ballot)
  const { did, password } = await loadGovernanceCreds(ballotRkey)

  const { accessJwt } = await pdsCreateSession(did, password)
  await pdsDeleteRecord(did, accessJwt, ARGUMENT_NSID, rkeyFromUri(doc.pdsUri))
}
