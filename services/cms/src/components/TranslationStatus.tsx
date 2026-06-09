'use client'

import React, { useEffect, useState } from 'react'
import { useDocumentInfo } from '@payloadcms/ui'

/**
 * Translation-status indicator: shows `DE ✓ FR ✗ IT ✓ RM ✗ EN ✓` for the
 * current document. Loads `?locale=all` from Payload's REST API and marks a
 * locale as covered when its `title` is non-empty.
 *
 * Sidebar variant (`TranslationStatusField`): used inside an Edit view via
 * the `admin.components.Field` slot of a `type: 'ui'` field. The list-cell
 * variant `TranslationStatusCell` can be wired up via `admin.components.Cell`
 * if desired.
 */

type LocaleMap = Record<string, { title?: string | null } | null | undefined>

const LANGUAGES = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_POLTR_LANGUAGES
  ? process.env.NEXT_PUBLIC_POLTR_LANGUAGES
  : 'de-CH,en-GB'
)
  .split(',')
  .map((c) => c.trim())
  .filter(Boolean)

function StatusBadges({ filled }: { filled: Record<string, boolean> }) {
  return (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      {LANGUAGES.map((code) => {
        const ok = !!filled[code]
        return (
          <span
            key={code}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              borderRadius: '4px',
              border: `1px solid ${ok ? 'var(--theme-success-500, #16a34a)' : 'var(--theme-elevation-200)'}`,
              color: ok ? 'var(--theme-success-700, #15803d)' : 'var(--theme-elevation-500)',
              fontSize: '0.75rem',
              fontWeight: 600,
              textTransform: 'uppercase',
            }}
            title={ok ? `${code} befüllt` : `${code} fehlt`}
          >
            {code} {ok ? '✓' : '✗'}
          </span>
        )
      })}
    </div>
  )
}

async function fetchLocaleMap(collection: string, id: string | number): Promise<LocaleMap> {
  const res = await fetch(
    `/api/${collection}/${encodeURIComponent(String(id))}?locale=all&depth=0`,
    { credentials: 'include' },
  )
  if (!res.ok) return {}
  const doc = await res.json()
  // Payload returns either `{title: {de: '...', fr: '...'}, ...}` or, for
  // older shapes, `{de: {title: '...'}, fr: {title: '...'}}`. Normalize.
  if (doc && typeof doc.title === 'object' && doc.title !== null && !Array.isArray(doc.title)) {
    const out: LocaleMap = {}
    for (const code of LANGUAGES) {
      const t = doc.title[code]
      out[code] = { title: typeof t === 'string' ? t : null }
    }
    return out
  }
  if (doc && typeof doc === 'object') {
    const out: LocaleMap = {}
    for (const code of LANGUAGES) {
      const slot = doc[code]
      out[code] = slot && typeof slot === 'object' ? { title: slot.title ?? null } : null
    }
    return out
  }
  return {}
}

function computeFilled(map: LocaleMap): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  for (const code of LANGUAGES) {
    const slot = map[code]
    out[code] = !!(slot && typeof slot.title === 'string' && slot.title.trim().length > 0)
  }
  return out
}

/** Sidebar field component. Wires up to a `type: 'ui'` field. */
export const TranslationStatusField: React.FC = () => {
  const { id, collectionSlug } = useDocumentInfo()
  const [filled, setFilled] = useState<Record<string, boolean> | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!id || !collectionSlug) return
    fetchLocaleMap(collectionSlug, id).then((map) => {
      if (!cancelled) setFilled(computeFilled(map))
    })
    return () => {
      cancelled = true
    }
  }, [id, collectionSlug])

  if (!id) {
    return (
      <div style={{ fontSize: '0.8125rem', color: 'var(--theme-elevation-500)' }}>
        Speichere zuerst das Dokument, um den Übersetzungs-Status zu sehen.
      </div>
    )
  }
  if (filled === null) {
    return (
      <div style={{ fontSize: '0.8125rem', color: 'var(--theme-elevation-500)' }}>
        Lade Übersetzungs-Status…
      </div>
    )
  }
  return (
    <div>
      <StatusBadges filled={filled} />
      <div style={{ marginTop: '6px', fontSize: '0.75rem', color: 'var(--theme-elevation-500)' }}>
        Eine Locale gilt als befüllt, sobald ein Titel eingetragen ist.
      </div>
    </div>
  )
}

/** List-cell component. Wires up via `admin.components.Cell` on a `type: 'ui'` field.
 *  Falls back to lightweight placeholders since list-cells should not block on fetches. */
export const TranslationStatusCell: React.FC<{ rowData?: { id?: string | number } }> = ({
  rowData,
}) => {
  const id = rowData?.id
  const [filled, setFilled] = useState<Record<string, boolean> | null>(null)

  useEffect(() => {
    if (id === undefined || id === null) return
    let cancelled = false
    // Use a guess at the collection from the URL — list-cells don't get
    // collection context. Defaults to 'imported-arguments' since that's the
    // collection where this cell is most useful in the list view.
    const path = typeof window !== 'undefined' ? window.location.pathname : ''
    const match = path.match(/\/admin\/collections\/([^/]+)/)
    const collection = match ? match[1] : 'imported-arguments'
    fetchLocaleMap(collection, id).then((map) => {
      if (!cancelled) setFilled(computeFilled(map))
    })
    return () => {
      cancelled = true
    }
  }, [id])

  if (!filled) {
    return <span style={{ color: 'var(--theme-elevation-400)', fontSize: '0.75rem' }}>…</span>
  }
  return <StatusBadges filled={filled} />
}

export default TranslationStatusField
