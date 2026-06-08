'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useDocumentInfo } from '@payloadcms/ui'

/**
 * Taxonomy-Editor im Ballot-Editor: lädt die Top-down-Themen-Hierarchie des
 * Calculator-Service (services/calculator/src/topdown) beim Öffnen in den State.
 *
 * Einheit = ARGUMENT: jedes Argument hängt an GENAU EINEM Knoten (Thema).
 * Klassifiziert wird direkt auf dem Argumenttext; je Zuordnung eine Konfidenz 1–5.
 *
 * ALLE Mutationen passieren lokal im State — manuell (umbenennen, verschieben,
 * löschen, ein-/ausrücken) und LLM-gestützt (Themen bauen, Argumente einsortieren,
 * wachsen lassen mergen jeweils nur einen *Vorschlag* in den State). Persistiert
 * wird erst am Ende mit einem einzigen „Persistieren" (POST /api/topdown/save,
 * ersetzt Knoten + Zuordnungen komplett). Zusätzlich Import/Export als JSON.
 *
 * Die LLM-Endpoints sind zustandslos: sie rechnen gegen den geschickten State-Baum
 * und schreiben nichts. Beim Löschen wandern die Zuordnungen an den Elternknoten.
 */

const CALC =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_CALCULATOR_URL) ||
  'https://calculator.poltr.info'

type ArgMembership = {
  argument_uri: string
  stance?: string | null
  confidence?: number | null // Klassifikator-Sicherheit 1–5 (oder null)
}

type ENode = {
  uid: string
  id?: number | null
  name: string
  description?: string | null // 1 Satz: was darunterfällt — interner Kontext für den LLM-Klassifikator
  introduction?: string | null // voter-facing: warum das Thema zählt & für wen — im Frontend gezeigt
  importance?: number | null // LLM-Prior 1–5: Wichtigkeit unter den Geschwistern (nur CMS)
  children: ENode[]
  arguments: ArgMembership[]
}

type Subtopic = {
  name: string
  description?: string
  introduction?: string
  importance?: number | null
}

type UnplacedEntry = {
  argument_uri: string
  title: string
  type?: string | null
  source_type?: string | null
  stance?: string | null
  fully_missing: boolean
}

async function calc(path: string, init?: RequestInit) {
  const res = await fetch(`${CALC}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.detail || `${res.status} ${res.statusText}`)
  return body
}

// --- Pure Baum-Helfer (operieren auf geklonten Bäumen) -----------------------

let _uidSeq = 0
const makeUid = () => `u${++_uidSeq}`
const newNode = (name = 'Neues Thema'): ENode => ({
  uid: makeUid(),
  id: null,
  name,
  description: null,
  introduction: null,
  importance: null,
  children: [],
  arguments: [],
})

/** Roh-Baum (vom Server / Import) → Editor-Form mit frischen uids. Einträge ohne
 *  argument_uri fallen weg. */
function withUids(n: unknown): ENode {
  const o = (n || {}) as Record<string, unknown>
  const rawArgs = Array.isArray(o.arguments) ? o.arguments : []
  const args: ArgMembership[] = rawArgs
    .filter(
      (a): a is Record<string, unknown> => !!a && typeof a === 'object' && 'argument_uri' in a,
    )
    .map((a) => ({
      argument_uri: String(a.argument_uri),
      stance: (a.stance as string | null) ?? null,
      confidence: (a.confidence as number | null | undefined) ?? null,
    }))
  return {
    uid: makeUid(),
    id: (o.id as number | null) ?? null,
    name: (o.name as string) || '(Wurzel)',
    description: (o.description as string | null) ?? null,
    introduction: (o.introduction as string | null) ?? null,
    importance: (o.importance as number | null) ?? null,
    children: Array.isArray(o.children) ? o.children.map(withUids) : [],
    arguments: args,
  }
}

type Located = { node: ENode; parent: ENode | null; index: number }
function locate(root: ENode, uid: string): Located | null {
  if (root.uid === uid) return { node: root, parent: null, index: -1 }
  const rec = (parent: ENode): Located | null => {
    for (let i = 0; i < parent.children.length; i++) {
      const ch = parent.children[i]
      if (ch.uid === uid) return { node: ch, parent, index: i }
      const r = rec(ch)
      if (r) return r
    }
    return null
  }
  return rec(root)
}

function indexByUid(root: ENode): Map<string, ENode> {
  const m = new Map<string, ENode>()
  const walk = (n: ENode) => {
    m.set(n.uid, n)
    n.children.forEach(walk)
  }
  walk(root)
  return m
}

function collectArgs(n: ENode): ArgMembership[] {
  let out = [...n.arguments]
  for (const ch of n.children) out = out.concat(collectArgs(ch))
  return out
}

/** Argumente in einen Knoten mergen (Dedup je Knoten über argument_uri). */
function mergeInto(target: ArgMembership[], add: ArgMembership[]) {
  const seen = new Set(target.map((m) => m.argument_uri))
  for (const m of add) {
    if (!seen.has(m.argument_uri)) {
      seen.add(m.argument_uri)
      target.push(m)
    }
  }
}

function counts(n: ENode): { args: number } {
  const ms = collectArgs(n)
  return { args: new Set(ms.map((m) => m.argument_uri)).size }
}

/** Editor-Baum → Server-Form (uid + Argumente) für /classify, /grow, /save. */
function toServer(n: ENode): Record<string, unknown> {
  return {
    uid: n.uid,
    name: n.name,
    description: n.description ?? null,
    introduction: n.introduction ?? null,
    importance: n.importance ?? null,
    arguments: n.arguments.map((m) => ({
      argument_uri: m.argument_uri,
      stance: m.stance ?? null,
      confidence: m.confidence ?? null,
    })),
    children: n.children.map(toServer),
  }
}

/** Editor-Baum → Export-Form (ohne uid/id). */
function toExport(n: ENode): Record<string, unknown> {
  const { uid: _u, id: _i, ...rest } = toServer(n) as Record<string, unknown>
  void _u
  void _i
  return { ...rest, children: n.children.map(toExport) }
}

/** Flache, einrückbare Liste aller ECHTEN Knoten (ohne Wurzel) — für das
 *  „einem Ast zuordnen"-Dropdown im Nicht-zugeordnet-Bereich. */
function flatNodes(root: ENode): Array<{ uid: string; label: string }> {
  const out: Array<{ uid: string; label: string }> = []
  const walk = (n: ENode, depth: number) => {
    if (depth > 0) out.push({ uid: n.uid, label: `${'  '.repeat(depth - 1)}${n.name}` })
    n.children.forEach((c) => walk(c, depth + 1))
  }
  walk(root, 0)
  return out
}

/** Membership eines Unplaced-Eintrags (manuell zugeordnet → keine Konfidenz). */
function entryMembership(e: UnplacedEntry): ArgMembership {
  return { argument_uri: e.argument_uri, stance: e.stance ?? null, confidence: null }
}

/** Wendet einen /branch_unplaced-Vorschlag an: neue Hauptäste unter der Wurzel,
 *  die übergebenen Argumente per `assign` (argument_uri → subtopic) auf die neuen
 *  Äste verteilt. */
function applyNewBranches(
  root: ENode,
  subtopics: Subtopic[],
  assign: Record<string, string>,
  memberships: ArgMembership[],
) {
  const used = new Set(Object.values(assign).filter((v) => v !== 'andere'))
  const nameToChild = new Map<string, ENode>()
  for (const s of subtopics) {
    if (!used.has(s.name)) continue
    const child = newNode(s.name)
    child.description = s.description ?? null
    child.introduction = s.introduction ?? null
    child.importance = s.importance ?? null
    nameToChild.set(s.name, child)
    root.children.push(child)
  }
  for (const m of memberships) {
    const child = nameToChild.get(assign[m.argument_uri])
    if (child) child.arguments.push(m)
  }
}

/** Wendet einen Split-Vorschlag aus /grow im State an (wie db.split_node): die
 *  Argumente werden gemäss `assign` (argument_uri → subtopic) auf die neuen Kinder
 *  verteilt; 'andere'/unverteilte bleiben am Elternknoten. */
function applySplit(node: ENode, subtopics: Subtopic[], assign: Record<string, string>) {
  const used = new Set(Object.values(assign).filter((v) => v !== 'andere'))
  const nameToChild = new Map<string, ENode>()
  for (const s of subtopics) {
    if (!used.has(s.name)) continue
    const child = newNode(s.name)
    child.description = s.description ?? null
    child.introduction = s.introduction ?? null
    child.importance = s.importance ?? null
    nameToChild.set(s.name, child)
    node.children.push(child)
  }
  const remaining: ArgMembership[] = []
  for (const m of node.arguments) {
    const child = nameToChild.get(assign[m.argument_uri])
    if (child) child.arguments.push(m)
    else remaining.push(m) // 'andere' / unverteilt → bleibt am Eltern
  }
  node.arguments = remaining
}

// --- Component ---------------------------------------------------------------

export const TaxonomyPanelField: React.FC = () => {
  const { id } = useDocumentInfo()
  const [rkey, setRkey] = useState<string | null>(null)
  const [root, setRoot] = useState<ENode | null>(null)
  const [dirty, setDirty] = useState(false)
  const [unplaced, setUnplaced] = useState<UnplacedEntry[]>([])
  const [showPartial, setShowPartial] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [nTopics, setNTopics] = useState<number | null>(null) // gewünschte Anzahl Wurzelthemen (leer = Default 4–7)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!id) return
    fetch(`/api/ballots/${id}?depth=0`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setRkey(d?.rkey ?? null))
      .catch(() => setRkey(null))
  }, [id])

  const load = useCallback(async (rk: string) => {
    try {
      const t = await calc(`/api/topdown/tree?ballot_rkey=${encodeURIComponent(rk)}`).catch(
        () => null,
      )
      setRoot(t?.tree ? withUids(t.tree) : null)
      setDirty(false)
    } catch {
      setRoot(null)
    }
    try {
      const u = await calc(`/api/topdown/unplaced?ballot_rkey=${encodeURIComponent(rk)}`).catch(
        () => null,
      )
      setUnplaced(Array.isArray(u?.unplaced) ? u.unplaced : [])
    } catch {
      setUnplaced([])
    }
  }, [])

  useEffect(() => {
    if (rkey) void load(rkey)
  }, [rkey, load])

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label)
    setErr(null)
    setMsg(null)
    try {
      await fn()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  // Lokale Mutation: aktuellen Baum klonen, mutieren, als dirty markieren.
  const mutate = (fn: (r: ENode) => void) => {
    setRoot((prev) => {
      if (!prev) return prev
      const clone: ENode = structuredClone(prev)
      fn(clone)
      return clone
    })
    setDirty(true)
  }

  // --- manuelle Operationen ---
  const rename = (uid: string, name: string) =>
    mutate((r) => {
      const l = locate(r, uid)
      if (l) l.node.name = name
    })
  const setDesc = (uid: string, d: string) =>
    mutate((r) => {
      const l = locate(r, uid)
      if (l) l.node.description = d || null
    })
  const setIntro = (uid: string, v: string) =>
    mutate((r) => {
      const l = locate(r, uid)
      if (l) l.node.introduction = v || null
    })
  const addChild = (uid: string) =>
    mutate((r) => {
      const l = locate(r, uid)
      if (l) l.node.children.push(newNode())
    })
  const addSibling = (uid: string) =>
    mutate((r) => {
      const l = locate(r, uid)
      if (l && l.parent) l.parent.children.splice(l.index + 1, 0, newNode())
    })
  const remove = (uid: string) =>
    mutate((r) => {
      const l = locate(r, uid)
      if (l && l.parent) {
        mergeInto(l.parent.arguments, collectArgs(l.node))
        l.parent.children.splice(l.index, 1)
      }
    })
  const moveUp = (uid: string) =>
    mutate((r) => {
      const l = locate(r, uid)
      if (l && l.parent && l.index > 0) {
        const a = l.parent.children
        ;[a[l.index - 1], a[l.index]] = [a[l.index], a[l.index - 1]]
      }
    })
  const moveDown = (uid: string) =>
    mutate((r) => {
      const l = locate(r, uid)
      if (l && l.parent && l.index < l.parent.children.length - 1) {
        const a = l.parent.children
        ;[a[l.index + 1], a[l.index]] = [a[l.index], a[l.index + 1]]
      }
    })
  const indent = (uid: string) =>
    mutate((r) => {
      const l = locate(r, uid)
      if (l && l.parent && l.index > 0) {
        const prev = l.parent.children[l.index - 1]
        l.parent.children.splice(l.index, 1)
        prev.children.push(l.node)
      }
    })
  const outdent = (uid: string) =>
    mutate((r) => {
      const l = locate(r, uid)
      if (!l || !l.parent) return
      const lp = locate(r, l.parent.uid)
      if (!lp || !lp.parent) return // Eltern ist die Wurzel → nicht weiter ausrücken
      l.parent.children.splice(l.index, 1)
      lp.parent.children.splice(lp.index + 1, 0, l.node)
    })

  // --- LLM-gestützte Operationen (mergen Vorschläge in den State) ---
  const themenBauen = () =>
    run('induce', async () => {
      if (
        root &&
        !confirm(
          'Themen neu bauen? Ersetzt den ganzen Baum im Editor inkl. aller Zuordnungen. (Gespeichert wird erst mit „Persistieren".)',
        )
      )
        return
      const r = await calc('/api/topdown/induce', {
        method: 'POST',
        body: JSON.stringify({
          ballot_rkey: rkey,
          options: { persist: false, official_only: true, n_topics: nTopics || null },
        }),
      })
      setRoot(withUids(r.tree))
      setDirty(true)
      setMsg(
        `Struktur gebaut: ${r.stats?.arguments} Argumente, ${r.stats?.andere} andere (${r.llm_calls} Calls). Jetzt „Argumente einsortieren".`,
      )
    })

  const argumenteEinsortieren = () =>
    run('classify', async () => {
      if (!root) return
      // Sortiert alle noch nicht verorteten Argumente in den State-Baum ein —
      // offiziell vor Community. Klassifiziert direkt auf dem Argumenttext.
      const r = await calc('/api/topdown/classify', {
        method: 'POST',
        body: JSON.stringify({ ballot_rkey: rkey, tree: toServer(root) }),
      })
      if (!r.additions?.length) {
        setMsg(r.message || 'Keine unverorteten Argumente.')
        return
      }
      mutate((rt) => {
        const idx = indexByUid(rt)
        for (const a of r.additions) {
          const node = idx.get(a.uid)
          if (node)
            mergeInto(node.arguments, [
              { argument_uri: a.argument_uri, stance: a.stance, confidence: a.confidence ?? null },
            ])
        }
      })
      setMsg(
        `+${r.placed} Argumente eingehängt (offiziell ${r.placed_official}, Community ${r.placed_community}). Mit „Persistieren" sichern.`,
      )
    })

  const wachsenLassen = () =>
    run('grow', async () => {
      if (!root) return
      const r = await calc('/api/topdown/grow', {
        method: 'POST',
        body: JSON.stringify({ ballot_rkey: rkey, tree: toServer(root) }),
      })
      if (!r.splits?.length) {
        setMsg(r.message || 'Kein Knoten über der Schwelle.')
        return
      }
      mutate((rt) => {
        const idx = indexByUid(rt)
        for (const sp of r.splits) {
          const node = idx.get(sp.uid)
          if (node) applySplit(node, sp.subtopics, sp.assign)
        }
      })
      setMsg(
        `${r.splits.length} Knoten gesplittet (${r.llm_calls} Calls). Mit „Persistieren" sichern.`,
      )
    })

  // --- Nicht zugeordnet: lokal aus dem State entfernen, was zugeordnet wurde ---
  const pruneUnplaced = (uris: Set<string>) =>
    setUnplaced((prev) => prev.filter((e) => !uris.has(e.argument_uri)))

  // Ein nicht zugeordnetes Argument einem bestehenden Ast als Hauptthema zuhängen.
  const assignEntryToNode = (entry: UnplacedEntry, uid: string) => {
    if (!uid) return
    mutate((rt) => {
      const node = indexByUid(rt).get(uid)
      if (node) mergeInto(node.arguments, [entryMembership(entry)])
    })
    pruneUnplaced(new Set([entry.argument_uri]))
    setMsg('Zugeordnet (lokal). Mit „Persistieren" sichern.')
  }

  // Aus allen ganz fehlenden Argumenten per LLM neue Hauptäste bilden.
  const neuerAstAusFehlenden = () =>
    run('branch', async () => {
      if (!root) return
      const entries = unplaced.filter((e) => e.fully_missing)
      const uris = Array.from(new Set(entries.map((e) => e.argument_uri)))
      if (uris.length < 2) {
        setMsg('Zu wenige ganz fehlende Argumente für einen neuen Ast.')
        return
      }
      const r = await calc('/api/topdown/branch_unplaced', {
        method: 'POST',
        body: JSON.stringify({ ballot_rkey: rkey, argument_uris: uris }),
      })
      if (!r.subtopics?.length) {
        setMsg(r.message || 'Keine tragfähigen neuen Themen.')
        return
      }
      const assign = r.assign as Record<string, string>
      const used = new Set<string>(Object.values(assign).filter((v) => v !== 'andere'))
      const mems = entries.map(entryMembership)
      mutate((rt) => applyNewBranches(rt, r.subtopics, assign, mems))
      const consumed = new Set(
        mems.filter((m) => used.has(assign[m.argument_uri])).map((m) => m.argument_uri),
      )
      pruneUnplaced(consumed)
      setMsg(
        `${used.size} neue Hauptäste gebildet (${r.llm_calls} Calls). Mit „Persistieren" sichern.`,
      )
    })

  // --- Import / Export / Persist / Reset ---
  const onImportFile = (file: File) =>
    run('import', async () => {
      const text = await file.text()
      const parsed = JSON.parse(text)
      if (!parsed || typeof parsed !== 'object' || !('name' in parsed))
        throw new Error('Ungültiges Format (erwartet einen Wurzelknoten mit name/children).')
      setRoot(withUids(parsed))
      setDirty(true)
      setMsg('Importiert. Mit „Persistieren" sichern.')
    })

  const onExport = () => {
    if (!root) return
    const blob = new Blob([JSON.stringify(toExport(root), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `taxonomy-${rkey}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const persist = () =>
    run('save', async () => {
      if (!root) return
      const r = await calc('/api/topdown/save', {
        method: 'POST',
        body: JSON.stringify({ ballot_rkey: rkey, tree: toServer(root) }),
      })
      setDirty(false)
      setMsg(`Persistiert: ${r.saved?.nodes} Knoten, ${r.saved?.memberships} Zuordnungen.`)
      await load(rkey!)
    })

  const reset = () =>
    run('reset', async () => {
      if (dirty && !confirm('Ungespeicherte Änderungen verwerfen und vom Server neu laden?')) return
      await load(rkey!)
    })

  if (!rkey) return <div style={{ color: 'var(--theme-elevation-500)' }}>Ballot wird geladen …</div>

  const btn: React.CSSProperties = {
    padding: '6px 12px',
    borderRadius: 4,
    border: '1px solid var(--theme-elevation-200)',
    background: 'var(--theme-elevation-50)',
    cursor: 'pointer',
    fontSize: '0.8rem',
  }
  const primaryBtn: React.CSSProperties = {
    ...btn,
    background: dirty ? 'var(--theme-success-500, #16a34a)' : 'var(--theme-elevation-100)',
    color: dirty ? '#fff' : 'var(--theme-elevation-500)',
    borderColor: 'transparent',
  }
  const iconBtn: React.CSSProperties = {
    width: 24,
    height: 24,
    lineHeight: '22px',
    textAlign: 'center',
    padding: 0,
    borderRadius: 4,
    border: '1px solid var(--theme-elevation-150)',
    background: 'var(--theme-elevation-50)',
    cursor: 'pointer',
    fontSize: '0.72rem',
  }
  const lock = !!busy

  // --- rekursives Rendering eines Knotens ---
  const renderNode = (node: ENode, depth: number): React.ReactNode => {
    const c = counts(node)
    const isRoot = depth === 0
    const directCount = new Set(
      node.arguments.map((m) => m.argument_uri),
    ).size
    return (
      <div
        key={node.uid}
        style={{
          marginLeft: depth ? 14 : 0,
          paddingLeft: depth ? 10 : 0,
          borderLeft: depth ? '1px solid var(--theme-elevation-150)' : 'none',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 6,
            alignItems: 'center',
            padding: '2px 0',
            flexWrap: 'wrap',
          }}
        >
          <input
            value={node.name}
            disabled={lock}
            onChange={(e) => rename(node.uid, e.target.value)}
            style={{
              fontWeight: depth <= 1 ? 600 : 400,
              fontSize: '0.82rem',
              padding: '2px 6px',
              border: '1px solid var(--theme-elevation-150)',
              borderRadius: 4,
              minWidth: 180,
              background: 'var(--theme-input-bg, #fff)',
              color: 'var(--theme-text)',
            }}
          />
          <span
            style={{
              fontSize: '0.7rem',
              color: 'var(--theme-elevation-500)',
              whiteSpace: 'nowrap',
            }}
          >
            {c.args} Argumente
            {node.children.length && directCount ? ` · ${directCount} direkt` : ''}
          </span>
          {!isRoot && node.importance != null && (
            <span
              title={`Wichtigkeit ${node.importance}/5 (LLM-Prior, relativ unter den Geschwistern)`}
              style={{
                fontSize: '0.7rem',
                color: 'var(--theme-elevation-600)',
                whiteSpace: 'nowrap',
              }}
            >
              {'★'.repeat(node.importance)}
              {'☆'.repeat(Math.max(0, 5 - node.importance))} {node.importance}/5
            </span>
          )}
          <span style={{ display: 'inline-flex', gap: 3 }}>
            <button
              type="button"
              title="Hoch"
              style={iconBtn}
              disabled={lock || isRoot}
              onClick={() => moveUp(node.uid)}
            >
              ↑
            </button>
            <button
              type="button"
              title="Runter"
              style={iconBtn}
              disabled={lock || isRoot}
              onClick={() => moveDown(node.uid)}
            >
              ↓
            </button>
            <button
              type="button"
              title="Ausrücken (zur Eltern-Ebene)"
              style={iconBtn}
              disabled={lock || isRoot}
              onClick={() => outdent(node.uid)}
            >
              ⬅
            </button>
            <button
              type="button"
              title="Einrücken (unter vorheriges Geschwister)"
              style={iconBtn}
              disabled={lock || isRoot}
              onClick={() => indent(node.uid)}
            >
              ➡
            </button>
            <button
              type="button"
              title="Unterthema hinzufügen"
              style={iconBtn}
              disabled={lock}
              onClick={() => addChild(node.uid)}
            >
              ＋
            </button>
            <button
              type="button"
              title="Geschwister hinzufügen"
              style={iconBtn}
              disabled={lock || isRoot}
              onClick={() => addSibling(node.uid)}
            >
              ＋₊
            </button>
            <button
              type="button"
              title="Löschen (Argumente wandern zum Eltern)"
              style={{ ...iconBtn, color: 'var(--theme-error-600, #dc2626)' }}
              disabled={lock || isRoot}
              onClick={() => remove(node.uid)}
            >
              🗑
            </button>
          </span>
        </div>
        <input
          value={node.description || ''}
          disabled={lock}
          placeholder="Beschreibung (intern, für die LLM-Einordnung)"
          onChange={(e) => setDesc(node.uid, e.target.value)}
          style={{
            margin: '1px 0 3px',
            fontSize: '0.72rem',
            padding: '1px 6px',
            width: 'min(420px, 90%)',
            border: '1px dashed var(--theme-elevation-150)',
            borderRadius: 4,
            background: 'transparent',
            color: 'var(--theme-elevation-600)',
          }}
        />
        {!isRoot && (
          <textarea
            value={node.introduction || ''}
            disabled={lock}
            rows={2}
            placeholder="Einleitung für Stimmbürger:innen: warum dieses Thema zählt und für wen (wird im Frontend gezeigt)"
            onChange={(e) => setIntro(node.uid, e.target.value)}
            style={{
              margin: '0 0 4px',
              fontSize: '0.72rem',
              padding: '3px 6px',
              width: 'min(420px, 90%)',
              border: '1px solid var(--theme-elevation-150)',
              borderRadius: 4,
              background: 'var(--theme-input-bg, #fff)',
              color: 'var(--theme-text)',
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
        )}
        {node.children.map((ch) => renderNode(ch, depth + 1))}
      </div>
    )
  }

  // --- „Nicht zugeordnet"-Bereich ---
  const renderUnplaced = (): React.ReactNode => {
    const fullyMissing = unplaced.filter((e) => e.fully_missing)
    const partial = unplaced.filter((e) => !e.fully_missing)
    const visible = showPartial ? unplaced : fullyMissing
    const nodeOpts = root ? flatNodes(root) : []
    const tag: React.CSSProperties = {
      fontSize: '0.64rem',
      fontWeight: 600,
      padding: '1px 6px',
      borderRadius: 10,
      whiteSpace: 'nowrap',
    }
    const badge = (e: UnplacedEntry) =>
      e.fully_missing ? (
        <span
          style={{
            ...tag,
            background: 'var(--theme-error-100, #fee2e2)',
            color: 'var(--theme-error-700, #b91c1c)',
          }}
        >
          ganz fehlt
        </span>
      ) : (
        <span
          style={{
            ...tag,
            background: 'var(--theme-elevation-100)',
            color: 'var(--theme-elevation-600)',
          }}
        >
          im Andere-Topf
        </span>
      )

    return (
      <div style={{ borderTop: '1px solid var(--theme-elevation-150)', paddingTop: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: '0.8rem' }}>Nicht zugeordnet</strong>
          <span style={{ fontSize: '0.72rem', color: 'var(--theme-elevation-500)' }}>
            {fullyMissing.length} ganz fehlend · {partial.length} im Andere-Topf
          </span>
          <span style={{ flex: 1 }} />
          <label
            style={{ fontSize: '0.72rem', display: 'inline-flex', gap: 4, alignItems: 'center' }}
          >
            <input
              type="checkbox"
              checked={showPartial}
              disabled={lock}
              onChange={(e) => setShowPartial(e.target.checked)}
            />
            auch „Andere-Topf“ zeigen
          </label>
          <button
            type="button"
            style={btn}
            disabled={lock || !root || !fullyMissing.length}
            title="Bildet aus allen ganz fehlenden Argumenten per LLM neue Hauptäste (Vorschlag in den State)."
            onClick={neuerAstAusFehlenden}
          >
            {busy === 'branch' ? '…' : 'Neuen Ast aus fehlenden'}
          </button>
        </div>

        {!visible.length ? (
          <div style={{ fontSize: '0.74rem', color: 'var(--theme-elevation-500)', marginTop: 6 }}>
            {unplaced.length
              ? 'Alle ganz fehlenden sind zugeordnet — Toggle zeigt die im „Andere-Topf".'
              : 'Alle Argumente sind einem Thema zugeordnet.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {visible.map((e) => (
              <div
                key={e.argument_uri}
                style={{
                  border: '1px solid var(--theme-elevation-150)',
                  borderRadius: 4,
                  padding: '6px 8px',
                }}
              >
                <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  {badge(e)}
                  <span style={{ fontSize: '0.7rem', color: 'var(--theme-elevation-500)' }}>
                    {e.type || ''}
                    {e.source_type === 'official' ? ' · offiziell' : ''}
                  </span>
                </div>
                <div style={{ fontSize: '0.78rem', margin: '3px 0', color: 'var(--theme-text)' }}>
                  {e.title || e.argument_uri}
                </div>
                <div style={{ marginTop: 4 }}>
                  <select
                    defaultValue=""
                    disabled={lock || !nodeOpts.length}
                    onChange={(ev) => {
                      const uid = ev.target.value
                      if (uid) {
                        assignEntryToNode(e, uid)
                        ev.target.value = ''
                      }
                    }}
                    style={{ fontSize: '0.72rem', padding: '2px 4px', maxWidth: '100%' }}
                  >
                    <option value="" disabled>
                      → einem Ast als Hauptthema zuordnen …
                    </option>
                    {nodeOpts.map((o) => (
                      <option key={o.uid} value={o.uid}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--theme-elevation-500)' }}>
        Der ganze Baum wird in den Editor geladen. Alle Änderungen — manuell und per LLM — bleiben
        lokal, bis du <strong>Persistieren</strong> klickst.
      </p>

      {/* LLM-Werkzeuge */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" style={btn} disabled={lock} onClick={themenBauen}>
          {busy === 'induce' ? '…' : 'Themen neu bauen'}
        </button>
        <label
          style={{
            fontSize: '0.72rem',
            color: 'var(--theme-elevation-500)',
            display: 'inline-flex',
            gap: 4,
            alignItems: 'center',
          }}
          title="Gewünschte Anzahl Wurzelthemen. Leer = Standard (4–7)."
        >
          Anzahl:
          <input
            type="number"
            min={1}
            max={20}
            value={nTopics ?? ''}
            disabled={lock}
            placeholder="4–7"
            onChange={(e) => {
              const v = parseInt(e.target.value, 10)
              setNTopics(Number.isFinite(v) ? Math.max(1, Math.min(20, v)) : null)
            }}
            style={{
              width: 56,
              fontSize: '0.72rem',
              padding: '2px 4px',
              border: '1px solid var(--theme-elevation-150)',
              borderRadius: 4,
            }}
          />
        </label>
        <button
          type="button"
          style={btn}
          disabled={lock || !root}
          title="Sortiert alle noch nicht verorteten Argumente in den Baum ein — offiziell vor Community. Klassifiziert direkt auf dem Argumenttext."
          onClick={argumenteEinsortieren}
        >
          {busy === 'classify' ? '…' : 'Argumente einsortieren'}
        </button>
        <button type="button" style={btn} disabled={lock || !root} onClick={wachsenLassen}>
          {busy === 'grow' ? '…' : 'Wachsen lassen'}
        </button>
      </div>

      {/* Datei + Persistenz */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" style={btn} disabled={lock} onClick={() => fileRef.current?.click()}>
          Import (JSON)
        </button>
        <button type="button" style={btn} disabled={lock || !root} onClick={onExport}>
          Export (JSON)
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onImportFile(f)
            e.target.value = ''
          }}
        />
        <span style={{ flex: 1 }} />
        <button
          type="button"
          style={primaryBtn}
          disabled={lock || !root || !dirty}
          onClick={persist}
        >
          {busy === 'save' ? '…' : dirty ? 'Persistieren *' : 'Persistiert'}
        </button>
        <button type="button" style={btn} disabled={lock} onClick={reset}>
          {busy === 'reset' ? '…' : 'Reset'}
        </button>
      </div>

      {dirty && (
        <div style={{ fontSize: '0.72rem', color: 'var(--theme-elevation-600)' }}>
          Ungespeicherte Änderungen — mit „Persistieren“ sichern.
        </div>
      )}

      {busy && <div style={{ fontSize: '0.8rem' }}>läuft: {busy} …</div>}
      {msg && (
        <div style={{ fontSize: '0.8rem', color: 'var(--theme-success-700, #15803d)' }}>{msg}</div>
      )}
      {err && (
        <div style={{ fontSize: '0.8rem', color: 'var(--theme-error-600, #dc2626)' }}>
          Fehler: {err}
        </div>
      )}

      <div>
        {root ? (
          renderNode(root, 0)
        ) : (
          <em style={{ color: 'var(--theme-elevation-500)' }}>
            Noch kein Baum — &bdquo;Themen neu bauen&ldquo;.
          </em>
        )}
      </div>

      {renderUnplaced()}
    </div>
  )
}

export default TaxonomyPanelField
