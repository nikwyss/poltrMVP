/**
 * ATProto community account creation for ballots, plus PDS record
 * publishing for content curated in the CMS (currently: imported
 * arguments from the Bundeskanzlei leaflet).
 *
 * Creates a PDS account, encrypts and stores credentials in the
 * AppView community_accounts table.
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

// Community-Master-Key (Key-Split): CMS verschlüsselt nur COMMUNITY-Creds → Community-Key.
function communityMasterKeyB64(): string {
  return env('APPVIEW_COMMUNITY_CREDS_MASTER_KEY_B64')
}

function encryptPassword(password: string): { ciphertext: Buffer; nonce: Buffer } {
  const keyB64 = communityMasterKeyB64()
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
// AppView DB: store community account
// ---------------------------------------------------------------------------

async function storeCommunityAccount(
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
      `INSERT INTO auth.community_accounts (did, handle, ballot_rkey, pw_ciphertext, pw_nonce)
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

export async function publishCommunityAccount(
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
  await storeCommunityAccount(did, handle, ballotId, ciphertext, nonce)

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

function decryptCommunityPassword(ciphertext: Buffer, nonce: Buffer): string {
  const keyB64 = communityMasterKeyB64()
  const key = Buffer.from(keyB64, 'base64')
  if (key.length !== 32) throw new Error('Master key must be 32 bytes')

  const opened = nacl.secretbox.open(
    new Uint8Array(ciphertext),
    new Uint8Array(nonce),
    new Uint8Array(key),
  )
  if (!opened) throw new Error('Failed to decrypt community password')
  return Buffer.from(opened).toString('utf-8')
}

async function loadCommunityCreds(ballotRkey: string): Promise<{
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
       FROM auth.community_accounts
       WHERE ballot_rkey = $1`,
      [ballotRkey],
    )
    if (!res.rows.length) {
      throw new Error(`No community account for ballot rkey ${ballotRkey}`)
    }
    const { did, handle, pw_ciphertext, pw_nonce } = res.rows[0]
    const password = decryptCommunityPassword(pw_ciphertext, pw_nonce)
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
 * Publish an imported argument (from the CMS) to its ballot's community
 * PDS account. Returns the AT URI + CID of the created record.
 */
export async function publishImportedArgument(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any,
  doc: ImportedArgumentDoc,
): Promise<{ uri: string; cid: string }> {
  const ballotRkey = await resolveBallotRkey(payload, doc.ballot)
  const { did, password } = await loadCommunityCreds(ballotRkey)
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
  const { did, password } = await loadCommunityCreds(ballotRkey)
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
  const { did, password } = await loadCommunityCreds(ballotRkey)

  const { accessJwt } = await pdsCreateSession(did, password)
  await pdsDeleteRecord(did, accessJwt, ARGUMENT_NSID, rkeyFromUri(doc.pdsUri))
}

// ---------------------------------------------------------------------------
// Taxonomy snapshots
//
// Beim „Persistieren" der Top-down-Taxonomie im CMS wird der persistierte Baum
// als unveränderlicher, öffentlich nachvollziehbarer Record auf das Community-
// Konto des Ballots geschrieben (append-only, ein Record je echter Änderung).
// Die Versionshistorie wird zusätzlich in app_taxonomy_snapshot indexiert.
// ---------------------------------------------------------------------------

const SNAPSHOT_NSID = 'app.ch.poltr.taxonomy.snapshot'

// Server-seitiger Zugriff auf den Calculator (liefert den persistierten Baum).
// Bevorzugt die interne K8s-Service-URL; fällt auf die öffentliche zurück.
const CALCULATOR_URL =
  process.env.CALCULATOR_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_CALCULATOR_URL ||
  'https://calculator.poltr.info'

/** Roh-Knoten, wie ihn der Calculator unter GET /api/topdown/tree liefert. */
type CalcTreeNode = {
  id?: number | null
  key?: string | null
  name: string
  description?: string | null
  introduction?: string | null
  importance?: number | null
  children?: CalcTreeNode[]
  arguments?: Array<{
    argument_uri: string
    confidence?: number | null
    stance?: string | null
  }>
}

type SnapshotArg = { rkey: string; confidence?: number; stance?: string }
type SnapshotNode = {
  key: string
  name: string
  description?: string
  introduction?: string
  importance?: number
  parent?: string
  arguments?: SnapshotArg[]
}

/** Persistierten Baum vom Calculator holen (nur für Backfill). `null`, wenn keiner existiert. */
async function fetchPersistedTree(ballotRkey: string): Promise<CalcTreeNode | null> {
  const url = `${CALCULATOR_URL}/api/topdown/tree?ballot_rkey=${encodeURIComponent(ballotRkey)}`
  const resp = await fetch(url, { headers: { 'Content-Type': 'application/json' } })
  if (resp.status === 404) return null
  if (!resp.ok) {
    throw new Error(`Calculator /tree fehlgeschlagen (${resp.status}): ${await resp.text()}`)
  }
  const data = (await resp.json()) as { tree?: CalcTreeNode | null }
  return data.tree ?? null
}

// Slug-Generierung — Port von services/calculator/src/core/db.py (_slugify/_unique_slug).
// Im Pivot vergibt das CMS die stabilen keys zur Autorenzeit (eingefroren im Record),
// statt sie beim DB-Insert zu generieren. Bestehende keys bleiben unverändert.
const _UMLAUT: Record<string, string> = {
  ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', Ä: 'ae', Ö: 'oe', Ü: 'ue',
}
function slugify(name: string): string {
  const s = (name || '').replace(/[äöüßÄÖÜ]/g, (c) => _UMLAUT[c] ?? c).toLowerCase()
  return s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'thema'
}
function uniqueSlug(base: string, used: Set<string>): string {
  let slug = base
  let i = 2
  while (used.has(slug)) {
    slug = `${base}-${i}`
    i++
  }
  used.add(slug)
  return slug
}

/**
 * Wurzel-Baum → flache Knotenliste (ohne die strukturelle Wurzel) in DFS-Pre-Order.
 * Die Array-Reihenfolge IST die Geschwister-Reihenfolge (der Indexer leitet daraus
 * `node_order` ab). Elternbezug über den stabilen `key`-Slug; Argumente per rkey
 * (gleiches Community-Repo). Knoten ohne `key` (im Editor neu angelegt) bekommen
 * hier einen eingefrorenen, kollisionsfreien Slug; bestehende keys bleiben.
 */
function flattenTree(root: CalcTreeNode): SnapshotNode[] {
  const out: SnapshotNode[] = []
  const used = new Set<string>()
  // Bestehende keys vorab reservieren, damit neu generierte Slugs nicht kollidieren.
  const seed = (n: CalcTreeNode) => {
    if (n.key) used.add(n.key)
    for (const c of n.children || []) seed(c)
  }
  for (const ch of root.children || []) seed(ch)

  const walk = (node: CalcTreeNode, parentKey: string | null) => {
    const key = node.key || uniqueSlug(slugify(node.name), used)
    const sn: SnapshotNode = { key, name: node.name }
    if (node.description) sn.description = node.description
    if (node.introduction) sn.introduction = node.introduction
    if (node.importance != null) sn.importance = node.importance
    if (parentKey != null) sn.parent = parentKey
    const args: SnapshotArg[] = []
    for (const a of node.arguments || []) {
      const ref: SnapshotArg = { rkey: rkeyFromUri(a.argument_uri) }
      if (a.confidence != null) ref.confidence = a.confidence
      if (a.stance === 'pro' || a.stance === 'contra') ref.stance = a.stance
      args.push(ref)
    }
    if (args.length) sn.arguments = args
    out.push(sn)
    for (const ch of node.children || []) walk(ch, key)
  }

  // Die strukturelle Wurzel wird nicht aufgenommen — ihre direkten Kinder sind die
  // obersten Themen (parent = undefined). Der Indexer rekonstruiert die Wurzel.
  // Argumente, die direkt an der Wurzel hängen (vormals „Andere-Topf"), werden NICHT
  // persistiert: eine Membership bedeutet „einem Thema zugeordnet". Solche Argumente
  // erscheinen nach der Projektion als „nicht zugeordnet".
  for (const ch of root.children || []) walk(ch, null)
  return out
}

/**
 * Deterministischer sha256-Hex über die Knoten — die ARRAY-Reihenfolge zählt mit
 * (Geschwister-Reihenfolge ist Inhalt → ein reines Umsortieren ergibt einen neuen
 * Snapshot). Argumente je Knoten nach `rkey` sortiert (Menge, Reihenfolge egal).
 * Basis für die Dedup beim Persistieren.
 */
function contentHash(nodes: SnapshotNode[]): string {
  const canon = nodes.map((n) => ({
    key: n.key,
    name: n.name,
    description: n.description ?? null,
    introduction: n.introduction ?? null,
    importance: n.importance ?? null,
    parent: n.parent ?? null,
    arguments: (n.arguments ?? [])
      .map((a) => ({
        rkey: a.rkey,
        confidence: a.confidence ?? null,
        stance: a.stance ?? null,
      }))
      .sort((x, y) => (x.rkey < y.rkey ? -1 : x.rkey > y.rkey ? 1 : 0)),
  }))
  return crypto.createHash('sha256').update(JSON.stringify(canon)).digest('hex')
}

/** Letzter (höchste Version) indexierter Snapshot eines Ballots, falls vorhanden. */
async function lastSnapshot(ballotRkey: string): Promise<{
  version: number
  at_uri: string
  cid: string
  content_hash: string
} | null> {
  const dbUrl = env('APPVIEW_POSTGRES_URL')
  const client = new pg.Client({ connectionString: dbUrl })
  try {
    await client.connect()
    const res = await client.query<{
      version: number
      at_uri: string
      cid: string
      content_hash: string
    }>(
      `SELECT version, at_uri, cid, content_hash
       FROM app_taxonomy_snapshot
       WHERE ballot_rkey = $1
       ORDER BY version DESC
       LIMIT 1`,
      [ballotRkey],
    )
    return res.rows[0] ?? null
  } finally {
    await client.end()
  }
}

async function recordSnapshot(
  ballotRkey: string,
  version: number,
  atUri: string,
  cid: string,
  hash: string,
): Promise<void> {
  const dbUrl = env('APPVIEW_POSTGRES_URL')
  const client = new pg.Client({ connectionString: dbUrl })
  try {
    await client.connect()
    await client.query(
      `INSERT INTO app_taxonomy_snapshot (ballot_rkey, version, at_uri, cid, content_hash)
       VALUES ($1, $2, $3, $4, $5)`,
      [ballotRkey, version, atUri, cid, hash],
    )
  } finally {
    await client.end()
  }
}

export type SnapshotResult =
  | { status: 'skipped'; version: number; reason: 'unchanged' }
  | { status: 'empty'; reason: 'no_tree' }
  | { status: 'published'; version: number; uri: string; cid: string; nodes: number; arguments: number }

/**
 * Den Taxonomie-Baum eines Ballots als unveränderlichen Snapshot-Record auf dessen
 * Community-Konto schreiben (append-only) und in app_taxonomy_snapshot indexieren.
 * Dieser Record ist die **Quelle der Wahrheit** — der Indexer projiziert ihn in
 * app_taxonomy_node/_membership.
 *
 * `root` = die strukturelle Wurzel (mit `children`), wie sie der CMS-Editor schickt
 * (toServer) bzw. der Calculator-Backfill liefert. Neue Knoten erhalten hier einen
 * eingefrorenen key.
 *
 * - Dedup: ist der Baum identisch zum letzten Snapshot (Content-Hash inkl.
 *   Geschwister-Reihenfolge), wird kein neuer Record geschrieben.
 * - Verkettet über `prev` (uri+cid) die Versionshistorie.
 */
export async function publishTaxonomySnapshot(
  ballotRkey: string,
  root: CalcTreeNode | null | undefined,
): Promise<SnapshotResult> {
  if (!root || !(root.children && root.children.length)) {
    return { status: 'empty', reason: 'no_tree' }
  }

  const nodes = flattenTree(root)
  const hash = contentHash(nodes)

  const prev = await lastSnapshot(ballotRkey)
  if (prev && prev.content_hash === hash) {
    return { status: 'skipped', version: prev.version, reason: 'unchanged' }
  }

  const version = (prev?.version ?? 0) + 1
  const argCount = nodes.reduce((acc, n) => acc + (n.arguments?.length ?? 0), 0)

  const record: Record<string, unknown> = {
    $type: SNAPSHOT_NSID,
    ballotRkey,
    version,
    contentHash: hash,
    attribution: { generator: 'poltr-cms' },
    nodes,
    createdAt: new Date().toISOString(),
  }
  if (prev) record.prev = { uri: prev.at_uri, cid: prev.cid }

  const { did, password } = await loadCommunityCreds(ballotRkey)
  const { accessJwt } = await pdsCreateSession(did, password)
  const { uri, cid } = await pdsCreateRecord(did, accessJwt, SNAPSHOT_NSID, record)

  await recordSnapshot(ballotRkey, version, uri, cid, hash)

  return { status: 'published', version, uri, cid, nodes: nodes.length, arguments: argCount }
}

/**
 * Backfill / Seed: einen Snapshot aus dem aktuell in der DB persistierten Baum
 * erzeugen (liest ihn über den Calculator). Einmalig pro bestehendem Ballot, um die
 * PDS-Quelle-der-Wahrheit zu setzen, bevor der Indexer-Projektionspfad übernimmt.
 */
export async function backfillTaxonomySnapshot(ballotRkey: string): Promise<SnapshotResult> {
  const root = await fetchPersistedTree(ballotRkey)
  return publishTaxonomySnapshot(ballotRkey, root)
}
