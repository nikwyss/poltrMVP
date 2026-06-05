'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { useDocumentInfo } from '@payloadcms/ui'

/**
 * Taxonomy-Panel im Ballot-Editor: bedient die Top-down-Themen-Hierarchie des
 * Calculator-Service (services/calculator/src/topdown).
 *
 * Workflow (Variante B):
 *   1. „Neu bauen (Vorschau)" → POST /api/topdown/induce {persist:false,
 *      official_only:true} — Baum nur aus den offiziellen Argumenten, OHNE zu
 *      schreiben. Ergebnis wird neben dem persistierten Stand (DB) gezeigt.
 *   2. „Vorschau übernehmen" → POST /api/topdown/persist (schreibt den gezeigten
 *      Baum deterministisch).
 *   3. „Community einsortieren" → POST /api/topdown/classify (neue Argumente).
 *   4. „Wachsen lassen" → POST /api/topdown/grow (überladene Knoten splitten).
 *
 * Calculator-Basis-URL via NEXT_PUBLIC_CALCULATOR_URL (Default die öffentliche
 * Instanz). Hinweis: der CMS-Origin muss in CALCULATOR_ALLOW_ORIGINS stehen
 * (CORS) — alternativ später ein server-seitiger Proxy (siehe TODO).
 */

const CALC =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_CALCULATOR_URL) ||
  'https://calculator.poltr.info'

type Node = {
  id?: number
  key?: string | null
  name: string
  description?: string | null
  codeCount?: number
  argumentCount?: number
  children?: Node[]
  codes?: Array<{ code: string } | string>
}

type Coverage = {
  arguments_total?: number
  done?: number
  uncoded?: number
  unplaced_arguments?: number
} | null

async function calc(path: string, init?: RequestInit) {
  const res = await fetch(`${CALC}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body?.detail || `${res.status} ${res.statusText}`)
  return body
}

function TreeView({ node, depth = 0 }: { node: Node; depth?: number }) {
  const codes = (node.codes || []).map((c) => (typeof c === 'string' ? c : c.code))
  return (
    <div style={{ marginLeft: depth ? 14 : 0, paddingLeft: depth ? 10 : 0, borderLeft: depth ? '1px solid var(--theme-elevation-150)' : 'none' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', padding: '2px 0' }}>
        <strong>{node.name}</strong>
        <span style={{ fontSize: '0.72rem', color: 'var(--theme-elevation-500)' }}>
          {typeof node.codeCount === 'number' ? `${node.codeCount} Codes` : ''}
          {typeof node.argumentCount === 'number' ? ` · ${node.argumentCount} Args` : ''}
          {node.key ? ` · ${node.key}` : ''}
        </span>
      </div>
      {!node.children?.length && codes.length > 0 && (
        <div style={{ fontSize: '0.72rem', color: 'var(--theme-elevation-500)', marginLeft: 4 }}>
          {codes.slice(0, 6).join(' · ')}
          {codes.length > 6 ? ` … (+${codes.length - 6})` : ''}
        </div>
      )}
      {(node.children || []).map((ch, i) => (
        <TreeView key={ch.id ?? ch.key ?? i} node={ch} depth={depth + 1} />
      ))}
    </div>
  )
}

export const TaxonomyPanelField: React.FC = () => {
  const { id } = useDocumentInfo()
  const [rkey, setRkey] = useState<string | null>(null)
  const [tree, setTree] = useState<Node | null>(null)
  const [preview, setPreview] = useState<Node | null>(null)
  const [coverage, setCoverage] = useState<Coverage>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  // rkey des Ballots laden
  useEffect(() => {
    if (!id) return
    fetch(`/api/ballots/${id}?depth=0`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setRkey(d?.rkey ?? null))
      .catch(() => setRkey(null))
  }, [id])

  const reload = useCallback(async (rk: string) => {
    try {
      const t = await calc(`/api/topdown/tree?ballot_rkey=${encodeURIComponent(rk)}`).catch(() => null)
      setTree(t?.tree ?? null)
    } catch {
      setTree(null)
    }
    // Coverage + ungehängte Argumente (per-Ballot).
    try {
      const st = await calc(`/api/topdown/status?ballot_rkey=${encodeURIComponent(rk)}`).catch(() => null)
      setCoverage(st ? { ...st.coverage, unplaced_arguments: st.unplaced_arguments } : null)
    } catch {
      setCoverage(null)
    }
  }, [])

  useEffect(() => {
    if (rkey) void reload(rkey)
  }, [rkey, reload])

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setErr(null); setMsg(null)
    try {
      await fn()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  if (!rkey) return <div style={{ color: 'var(--theme-elevation-500)' }}>Ballot wird geladen …</div>

  const btn: React.CSSProperties = {
    padding: '6px 12px', borderRadius: 4, border: '1px solid var(--theme-elevation-200)',
    background: 'var(--theme-elevation-50)', cursor: 'pointer', fontSize: '0.8rem',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" style={btn} disabled={!!busy}
          onClick={() => run('induce', async () => {
            const r = await calc('/api/topdown/induce', {
              method: 'POST',
              body: JSON.stringify({ ballot_rkey: rkey, options: { persist: false, official_only: true } }),
            })
            setPreview(r.tree); setMsg(`Vorschau gebaut (${r.llm_calls} LLM-Calls, ${r.stats?.codes} Codes, ${r.stats?.andere} andere).`)
          })}>
          {busy === 'induce' ? '…' : 'Neu bauen (Vorschau)'}
        </button>
        <button type="button" style={btn} disabled={!!busy || !preview}
          onClick={() => run('persist', async () => {
            if (!preview) return
            if (!confirm('Vorschau-Baum übernehmen? Ersetzt den bestehenden Baum.')) return
            await calc('/api/topdown/persist', {
              method: 'POST', body: JSON.stringify({ ballot_rkey: rkey, tree: preview }),
            })
            setPreview(null); setMsg('Übernommen.'); await reload(rkey)
          })}>
          Vorschau übernehmen
        </button>
        <button type="button" style={btn} disabled={!!busy}
          onClick={() => run('classify', async () => {
            const r = await calc('/api/topdown/classify', {
              method: 'POST', body: JSON.stringify({ ballot_rkey: rkey }),
            })
            setMsg(`Eingehängt: ${r.placed} (${r.new_codes} neue Codes, ${r.llm_calls ?? 0} Calls).`); await reload(rkey)
          })}>
          Community einsortieren
        </button>
        <button type="button" style={btn} disabled={!!busy}
          onClick={() => run('grow', async () => {
            const r = await calc('/api/topdown/grow', {
              method: 'POST', body: JSON.stringify({ ballot_rkey: rkey }),
            })
            setMsg(`Wachstum: ${r.splits?.length ?? 0} Knoten gesplittet (${r.llm_calls ?? 0} Calls).`); await reload(rkey)
          })}>
          Wachsen lassen
        </button>
      </div>

      {coverage && (
        <div style={{ fontSize: '0.75rem', color: 'var(--theme-elevation-600)' }}>
          Codiert: {coverage.done ?? '—'} / {coverage.arguments_total ?? '—'} Argumente
          {typeof coverage.uncoded === 'number' ? ` · ${coverage.uncoded} ohne Open Code` : ''}
          {typeof coverage.unplaced_arguments === 'number' ? ` · ${coverage.unplaced_arguments} noch nicht im Baum` : ''}
        </div>
      )}

      {busy && <div style={{ fontSize: '0.8rem' }}>läuft: {busy} …</div>}
      {msg && <div style={{ fontSize: '0.8rem', color: 'var(--theme-success-700, #15803d)' }}>{msg}</div>}
      {err && <div style={{ fontSize: '0.8rem', color: 'var(--theme-error-600, #dc2626)' }}>Fehler: {err}</div>}

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px' }}>
          <h4 style={{ margin: '4px 0' }}>Persistiert (DB)</h4>
          {tree ? <TreeView node={tree} /> : <em style={{ color: 'var(--theme-elevation-500)' }}>Noch kein Baum.</em>}
        </div>
        {preview && (
          <div style={{ flex: '1 1 320px' }}>
            <h4 style={{ margin: '4px 0' }}>Vorschau (nicht gespeichert)</h4>
            <TreeView node={preview} />
          </div>
        )}
      </div>
    </div>
  )
}

export default TaxonomyPanelField
