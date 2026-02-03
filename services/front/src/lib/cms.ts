/**
 * CMS API Client
 * Fetches content from Payload CMS at cms.poltr.info
 */

const CMS_URL = process.env.NEXT_PUBLIC_CMS_URL || 'https://cms.poltr.info'

export type Locale = 'de' | 'fr' | 'en'

export interface CMSPage {
  id: string
  title: string
  slug: string
  content: unknown // Lexical rich text JSON
  excerpt?: string
  meta?: {
    title?: string
    description?: string
    image?: CMSMedia
  }
  status: 'draft' | 'published'
  publishedAt?: string
  createdAt: string
  updatedAt: string
}

export interface CMSBlock {
  id: string
  title: string
  slug: string
  content: unknown // Lexical rich text JSON
  placement: 'homepage' | 'header' | 'footer' | 'sidebar' | 'banner' | 'modal'
  active: boolean
  priority: number
  createdAt: string
  updatedAt: string
}

export interface CMSMedia {
  id: string
  filename: string
  mimeType: string
  url: string
  alt: string
  caption?: string
  width?: number
  height?: number
  sizes?: {
    thumbnail?: { url: string; width: number; height: number }
    card?: { url: string; width: number; height: number }
    hero?: { url: string; width: number; height: number }
  }
}

export interface CMSSettings {
  siteName: string
  tagline?: string
  logo?: CMSMedia
  email?: string
  phone?: string
  address?: string
  social?: Array<{
    platform: 'bluesky' | 'mastodon' | 'twitter' | 'linkedin' | 'github'
    url: string
  }>
}

interface PaginatedResponse<T> {
  docs: T[]
  totalDocs: number
  limit: number
  totalPages: number
  page: number
  pagingCounter: number
  hasPrevPage: boolean
  hasNextPage: boolean
  prevPage: number | null
  nextPage: number | null
}

async function fetchCMS<T>(
  endpoint: string,
  locale: Locale = 'de',
  options?: RequestInit
): Promise<T> {
  const url = new URL(`/api${endpoint}`, CMS_URL)
  url.searchParams.set('locale', locale)
  url.searchParams.set('fallback-locale', 'de')

  const response = await fetch(url.toString(), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    next: { revalidate: 60 }, // ISR: cache for 60 seconds
  })

  if (!response.ok) {
    throw new Error(`CMS API error: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

/**
 * Get a page by slug
 */
export async function getPage(
  slug: string,
  locale: Locale = 'de'
): Promise<CMSPage | null> {
  try {
    const response = await fetchCMS<PaginatedResponse<CMSPage>>(
      `/pages?where[slug][equals]=${encodeURIComponent(slug)}&where[status][equals]=published`,
      locale
    )
    return response.docs[0] ?? null
  } catch (error) {
    console.error('Error fetching page:', error)
    return null
  }
}

/**
 * Get all published pages
 */
export async function getPages(locale: Locale = 'de'): Promise<CMSPage[]> {
  try {
    const response = await fetchCMS<PaginatedResponse<CMSPage>>(
      '/pages?where[status][equals]=published&sort=title&limit=100',
      locale
    )
    return response.docs
  } catch (error) {
    console.error('Error fetching pages:', error)
    return []
  }
}

/**
 * Get a block by slug
 */
export async function getBlock(
  slug: string,
  locale: Locale = 'de'
): Promise<CMSBlock | null> {
  try {
    const response = await fetchCMS<PaginatedResponse<CMSBlock>>(
      `/blocks?where[slug][equals]=${encodeURIComponent(slug)}&where[active][equals]=true`,
      locale
    )
    return response.docs[0] ?? null
  } catch (error) {
    console.error('Error fetching block:', error)
    return null
  }
}

/**
 * Get all active blocks for a specific placement
 */
export async function getBlocksByPlacement(
  placement: CMSBlock['placement'],
  locale: Locale = 'de'
): Promise<CMSBlock[]> {
  try {
    const response = await fetchCMS<PaginatedResponse<CMSBlock>>(
      `/blocks?where[placement][equals]=${encodeURIComponent(placement)}&where[active][equals]=true&sort=-priority&limit=100`,
      locale
    )
    return response.docs
  } catch (error) {
    console.error('Error fetching blocks:', error)
    return []
  }
}

/**
 * Get site settings
 */
export async function getSettings(locale: Locale = 'de'): Promise<CMSSettings | null> {
  try {
    return await fetchCMS<CMSSettings>('/globals/settings', locale)
  } catch (error) {
    console.error('Error fetching settings:', error)
    return null
  }
}

/**
 * Get media item by ID
 */
export async function getMedia(
  id: string,
  locale: Locale = 'de'
): Promise<CMSMedia | null> {
  try {
    return await fetchCMS<CMSMedia>(`/media/${id}`, locale)
  } catch (error) {
    console.error('Error fetching media:', error)
    return null
  }
}
