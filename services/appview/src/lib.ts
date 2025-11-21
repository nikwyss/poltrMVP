export type DBRow = { [key: string]: any }

export const getString = (obj: DBRow, key: string): string | null => {
  const v = obj[key]
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  return null
}

export const getDateISO = (obj: DBRow, key: string): string | null => {
  const v = obj[key]
  if (!v) return null
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v)
    return isNaN(d.getTime()) ? null : d.toISOString()
  }
  if (v instanceof Date) return v.toISOString()
  return null
}

export const getNumber = (obj: DBRow, key: string): number => {
  const v = obj[key]
  if (typeof v === 'number') return v
  if (typeof v === 'string') return Number(v) || 0
  return 0
}

export const getArray = (obj: DBRow, key: string): unknown[] => {
  const v = obj[key]
  return Array.isArray(v) ? v : []
}

export const getObject = (obj: DBRow, key: string): Record<string, any> | null => {
  const v = obj[key]
  return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : null
}
