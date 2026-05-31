'use client'

import React from 'react'
import { Link } from '@payloadcms/ui'

/**
 * Custom list-cell for the Ballots collection: renders two per-row actions —
 * "Bearbeiten" (the standard edit view) and "Argumente" (the official
 * arguments for this ballot, as a pre-filtered imported-arguments list).
 *
 * Registered via a virtual `ui` field on the Ballots collection.
 */
export const BallotRowActions: React.FC<{ rowData?: { id?: string | number } }> = ({
  rowData,
}) => {
  const id = rowData?.id
  if (id === undefined || id === null) return null

  const editHref = `/admin/collections/ballots/${id}`
  const argsHref = `/admin/collections/imported-arguments?where[ballot][equals]=${id}`

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
      <Link href={argsHref} style={style} prefetch={false}>
        Argumente
      </Link>
    </div>
  )
}

export default BallotRowActions
