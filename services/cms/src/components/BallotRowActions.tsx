'use client'

import React from 'react'
import { Link } from '@payloadcms/ui'

/**
 * Custom list-cell for the Ballots collection: a per-row "Bearbeiten" action
 * (the standard edit view). Offizielle Argumente werden dort im Tab „Offizielle
 * Argumente" bearbeitet — der frühere „Argumente"-Link auf die Standalone-Liste
 * der imported-arguments entfällt, weil die Collection jetzt `hidden` ist.
 *
 * Registered via a virtual `ui` field on the Ballots collection.
 */
export const BallotRowActions: React.FC<{ rowData?: { id?: string | number } }> = ({
  rowData,
}) => {
  const id = rowData?.id
  if (id === undefined || id === null) return null

  const editHref = `/admin/collections/ballots/${id}`

  const style: React.CSSProperties = {
    display: 'inline-block',
    padding: '2px 10px',
    borderRadius: '4px',
    border: '1px solid var(--theme-elevation-150)',
    fontSize: '0.8125rem',
    fontWeight: 600,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  }

  return (
    <div style={{ display: 'flex', gap: '6px' }}>
      <Link href={editHref} style={style} prefetch={false}>
        Bearbeiten
      </Link>
    </div>
  )
}

export default BallotRowActions
