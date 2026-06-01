import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Pages } from './collections/Pages'
import { Blocks } from './collections/Blocks'
import { Ballots } from './collections/Ballots'
import { OfficialArguments } from './collections/OfficialArguments'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// Single source of truth for language codes. Mirrors the AppView/Indexer
// `POLTR_LANGUAGES` env var. Payload requires statically declared locales
// (it generates per-locale DB columns at boot/migration time), so the list
// is materialized here at module load; redeploy + migration on extension.
const SUPPORTED_LANGUAGES = (process.env.POLTR_LANGUAGES || 'de,fr,it,rm,en')
  .split(',')
  .map((c) => c.trim())
  .filter(Boolean)

const LOCALE_LABELS: Record<string, string> = {
  de: 'Deutsch',
  fr: 'Français',
  it: 'Italiano',
  rm: 'Rumantsch',
  en: 'English',
}

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Media, Pages, Blocks, Ballots, OfficialArguments],
  editor: lexicalEditor(),
  secret: process.env.CMS_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  localization: {
    locales: SUPPORTED_LANGUAGES.map((code) => ({
      code,
      label: LOCALE_LABELS[code] || code.toUpperCase(),
    })),
    defaultLocale: process.env.POLTR_DEFAULT_LANGUAGE || 'de',
    fallback: true,
  },
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URI || process.env.CMS_DATABASE_URL || '',
    },
  }),
  sharp,
  plugins: [],
})
