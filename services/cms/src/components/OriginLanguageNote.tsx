'use client'

import React from 'react'

/**
 * Read-only Seitenbemerkung in der Sidebar: CMS-Inhalte werden immer auf Deutsch
 * erfasst, daher ist die Quellsprache fix `de` (kein editierbares Dropdown mehr).
 * Das eigentliche `originLanguage`-Feld bleibt als verstecktes Datenfeld (Default
 * 'de') erhalten, damit Frontend/AppView die „Original auf X"-Badges weiter lesen.
 */
export const OriginLanguageNote: React.FC = () => {
  return (
    <div style={{ fontSize: '0.72rem', color: 'var(--theme-elevation-500)', lineHeight: 1.4 }}>
      <span style={{ fontWeight: 600, color: 'var(--theme-elevation-600)' }}>
        Quellsprache: Deutsch
      </span>
      <br />
      CMS-Inhalte werden immer auf Deutsch erfasst; Übersetzungen entstehen über den
      Sprach-Switcher.
    </div>
  )
}

export default OriginLanguageNote
