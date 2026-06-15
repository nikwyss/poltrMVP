'use client'

import React, { useCallback, useMemo, useRef, useState } from 'react'
import { useConfig, useDocumentInfo } from '@payloadcms/ui'

/**
 * Import-/Export-Werkzeug im Ballot-Editor (Tab „Offizielle Argumente"): lädt
 * eine JSON-Datei mit offiziellen PRO/CONTRA-Argumenten hoch und legt sie als
 * `imported-arguments` für diese Vorlage an bzw. aktualisiert sie. Optional
 * werden sie direkt publiziert (→ PDS).
 *
 * Mehrsprachig: pro Argument ein `translations`-Objekt (Locale → {title,body}).
 * `originLanguage` bestimmt die Hauptsprache (Top-Level im ATProto-Record),
 * alle weiteren konfigurierten Locales landen als Übersetzungen.
 *
 *   {
 *     "argumente": [
 *       { "id": 25, "type": "PRO", "originLanguage": "de-CH",
 *         "translations": { "de-CH": {"title":"…","body":"…"},
 *                           "en-GB": {"title":"…","body":"…"} } }
 *     ]
 *   }
 *
 * Akzeptiert weiterhin ein blankes Array, { "items": [...] } und flache
 * `title`/`body` (→ originLanguage). Eintrag MIT `id` aktualisiert, OHNE legt
 * neu an. Server: POST /api/imported-arguments/import.
 */

type ImportResult = {
  created: number
  updated: number
  published: number
  skipped: number
  errors: string[]
}

/** Tolerant: akzeptiert {argumente}, {items}, {arguments} oder ein blankes Array. */
function extractItems(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>
    for (const key of ['argumente', 'items', 'arguments']) {
      if (Array.isArray(obj[key])) return obj[key] as unknown[]
    }
  }
  throw new Error('JSON enthält kein Array "argumente" (oder "items"/"arguments").')
}

export const ImportOfficialArguments: React.FC = () => {
  const { id } = useDocumentInfo()
  const { config } = useConfig()

  // Konfigurierte Content-Locales + Default aus der Payload-Config.
  const { locales, defaultLocale } = useMemo(() => {
    const loc = config?.localization
    if (!loc) return { locales: ['de-CH'], defaultLocale: 'de-CH' }
    const codes = loc.locales.map((l) => (typeof l === 'string' ? l : l.code))
    const def =
      typeof loc.defaultLocale === 'string' ? loc.defaultLocale : codes[0] || 'de-CH'
    return { locales: codes, defaultLocale: def }
  }, [config])

  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [errs, setErrs] = useState<string[]>([])
  const [publish, setPublish] = useState(true)
  const [section, setSection] = useState('')
  const [documentRef, setDocumentRef] = useState('')

  const download = useCallback((payload: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  const emptyTranslations = useCallback(
    () => Object.fromEntries(locales.map((lc) => [lc, { title: '', body: '' }])),
    [locales],
  )

  // Exportiert die bestehenden offiziellen Argumente dieser Vorlage MIT id und
  // allen Sprachen, damit man sie bearbeiten und re-importieren kann. Gibt es
  // noch keine, wird eine leere Vorlage (mit allen Locales) heruntergeladen.
  const downloadExport = useCallback(async () => {
    if (!id) return
    setBusy(true)
    setMsg(null)
    try {
      const qs = new URLSearchParams({
        'where[ballot][equals]': String(id),
        'where[sourceType][equals]': 'official',
        limit: '1000',
        depth: '0',
        locale: 'all', // localized Felder kommen als { 'de-CH': …, 'en-GB': … }
        sort: 'type',
      })
      const res = await fetch(`/api/imported-arguments?${qs.toString()}`, {
        credentials: 'include',
      })
      const data = (await res.json()) as {
        docs?: Array<{
          id: number
          type: string
          originLanguage?: string
          title?: Record<string, string | null> | string
          body?: Record<string, string | null> | string
          section?: string | null
          documentRef?: string | null
        }>
      }
      const docs = data.docs || []
      if (!docs.length) {
        const template = {
          argumente: [
            { id: null, type: 'PRO', originLanguage: defaultLocale, translations: emptyTranslations() },
            { id: null, type: 'CONTRA', originLanguage: defaultLocale, translations: emptyTranslations() },
          ],
        }
        download(template, `official_arguments_${id}_template.json`)
        setMsg('Noch keine Argumente vorhanden — leere Vorlage (alle Sprachen) heruntergeladen.')
        return
      }
      const pick = (v: Record<string, string | null> | string | undefined, lc: string): string => {
        if (v && typeof v === 'object') return v[lc] || ''
        return ''
      }
      const argumente = docs.map((d) => {
        const translations: Record<string, { title: string; body: string }> = {}
        for (const lc of locales) {
          const t = pick(d.title, lc)
          const b = pick(d.body, lc)
          if (t || b) translations[lc] = { title: t, body: b }
        }
        return {
          id: d.id,
          type: d.type,
          originLanguage: d.originLanguage || defaultLocale,
          ...(d.section ? { section: d.section } : {}),
          ...(d.documentRef ? { documentRef: d.documentRef } : {}),
          translations,
        }
      })
      download({ argumente }, `official_arguments_${id}.json`)
      setMsg(`${docs.length} Argument(e) mit id & Sprachen exportiert.`)
    } catch (err) {
      setMsg(`Fehler beim Export: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }, [id, locales, defaultLocale, download, emptyTranslations])

  const onFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = '' // erlaubt erneuten Import derselben Datei
      if (!file || !id) return
      setBusy(true)
      setMsg(null)
      setErrs([])
      try {
        const text = await file.text()
        const items = extractItems(JSON.parse(text))
        if (!items.length) throw new Error('Keine Argumente in der Datei gefunden.')

        const res = await fetch('/api/imported-arguments/import', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ballotId: id,
            publish,
            section: section.trim() || undefined,
            documentRef: documentRef.trim() || undefined,
            items,
          }),
        })
        const data = (await res.json()) as ImportResult & { error?: string }
        if (!res.ok) {
          // Validierungsfehler (400) listen die betroffenen Einträge auf.
          setErrs(data.errors || [])
          throw new Error(data.error || `${res.status} ${res.statusText}`)
        }

        setErrs(data.errors || [])
        setMsg(
          `Import abgeschlossen: ${data.created} neu, ${data.updated} aktualisiert` +
            (publish ? `, ${data.published} auf dem PDS` : ' (als Draft)') +
            '.',
        )
        // Join-Liste der Argumente neu laden.
        if (data.created > 0 || data.updated > 0) setTimeout(() => window.location.reload(), 1200)
      } catch (err) {
        setMsg(`Fehler: ${err instanceof Error ? err.message : String(err)}`)
      } finally {
        setBusy(false)
      }
    },
    [id, publish, section, documentRef],
  )

  const btn: React.CSSProperties = {
    padding: '6px 12px',
    borderRadius: 4,
    border: '1px solid var(--theme-elevation-200)',
    background: 'var(--theme-elevation-50)',
    cursor: 'pointer',
    fontSize: '0.8rem',
  }
  const input: React.CSSProperties = {
    padding: '6px 8px',
    borderRadius: 4,
    border: '1px solid var(--theme-elevation-200)',
    background: 'var(--theme-input-bg)',
    fontSize: '0.8rem',
    minWidth: 220,
  }

  if (!id) {
    return (
      <div style={{ color: 'var(--theme-elevation-500)', fontSize: '0.85rem', margin: '0.5rem 0' }}>
        Bitte die Vorlage zuerst speichern, dann können offizielle Argumente importiert werden.
      </div>
    )
  }

  return (
    <div
      style={{
        border: '1px solid var(--theme-elevation-150)',
        borderRadius: 6,
        padding: '0.9rem',
        margin: '0.5rem 0 1.2rem',
        background: 'var(--theme-elevation-25)',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Aus JSON importieren / exportieren</div>
      <div style={{ color: 'var(--theme-elevation-500)', fontSize: '0.8rem', marginBottom: 10 }}>
        Mehrsprachig: pro Argument ein <code>translations</code>-Objekt (Sprache →{' '}
        <code>title</code>/<code>body</code>) plus <code>originLanguage</code>. Konfigurierte
        Sprachen: <b>{locales.join(', ')}</b> (Default {defaultLocale}). Eintrag <b>mit</b>{' '}
        <code>id</code> aktualisiert, <b>ohne</b> legt neu an. Titel müssen je Vorlage eindeutig
        sein. Lade zum Bearbeiten am besten zuerst die aktuellen Argumente herunter.
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <input
          style={input}
          type="text"
          placeholder='Abschnitt/Quelle (optional, z.B. "Argumente Bundesrat, S. 19")'
          value={section}
          onChange={(e) => setSection(e.target.value)}
        />
        <input
          style={input}
          type="text"
          placeholder="Quell-URL / documentRef (optional)"
          value={documentRef}
          onChange={(e) => setDocumentRef(e.target.value)}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}>
          <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
          Direkt publizieren (auf den PDS schreiben)
        </label>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" style={btn} onClick={downloadExport} disabled={busy}>
          Aktuelle Argumente / Vorlage herunterladen
        </button>
        <button
          type="button"
          style={{ ...btn, fontWeight: 600 }}
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          {busy ? 'Importiere …' : 'JSON-Datei wählen & importieren'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={onFile}
        />
      </div>

      {msg && (
        <div
          style={{
            marginTop: 10,
            fontSize: '0.8rem',
            color: msg.startsWith('Fehler') ? 'var(--theme-error-500)' : 'var(--theme-success-600)',
          }}
        >
          {msg}
        </div>
      )}
      {errs.length > 0 && (
        <ul style={{ marginTop: 6, fontSize: '0.78rem', color: 'var(--theme-error-500)' }}>
          {errs.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
