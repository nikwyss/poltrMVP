'use client'

import React from 'react'
import { useField } from '@payloadcms/ui'

/**
 * Status-Control links neben den Save/Publish-Buttons im Ballot-Editor.
 *
 * Der Status (draft/published/archived) gilt dokumentübergreifend (alle Tabs),
 * darum sitzt er prominent im Document-Header statt in der Sidebar. Gerendert
 * über `admin.components.beforeDocumentControls` der Ballots-Collection; bindet
 * an das ansonsten ausgeblendete `status`-Feld via `useField`.
 */
const OPTIONS = [
  { label: 'Draft', value: 'draft' },
  { label: 'Published', value: 'published' },
  { label: 'Archived', value: 'archived' },
] as const

export const BallotStatusControl: React.FC = () => {
  const { value, setValue } = useField<string>({ path: 'status' })
  const current = value ?? 'draft'

  return (
    <label
      title="Nur draft/published werden vom Calculator codiert; archived nicht."
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 12 }}
    >
      <span
        style={{
          fontSize: '0.7rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--theme-elevation-500)',
        }}
      >
        Status
      </span>
      <select
        value={current}
        onChange={(e) => setValue(e.target.value)}
        style={{
          fontSize: '0.85rem',
          padding: '7px 10px',
          borderRadius: 'var(--style-radius-s, 4px)',
          border: '1px solid var(--theme-elevation-200)',
          background: 'var(--theme-input-bg, var(--theme-elevation-50))',
          color: 'var(--theme-text)',
          cursor: 'pointer',
        }}
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export default BallotStatusControl
