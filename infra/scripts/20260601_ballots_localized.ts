/**
 * Migrate existing Ballot/OfficialArgument documents into the per-locale
 * slots introduced by Payload Localization (see doc/RECORD_TRANSLATIONS.md §2g).
 *
 * Before: `title` / `description` / `topic` / `body` were monolingual text
 *         columns, and `ballots.language` indicated the source language.
 * After:  `title` & co. are `localized: true`. This migration copies each
 *         existing value into the slot of the original language (Ballots:
 *         from `language`, OfficialArguments: 'de' default) and sets
 *         `originLanguage` accordingly.
 *
 * Idempotent: re-runs only touch documents where `originLanguage` is not
 * yet set, so it's safe to invoke multiple times.
 *
 * Run via Payload's migration runner (`pnpm payload migrate`) or import
 * the `up` function from a one-shot script.
 */

import type { Payload } from 'payload'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MigrationArgs = { payload: Payload; req?: any }

export async function up({ payload, req }: MigrationArgs): Promise<void> {
  // ---------- Ballots ----------
  const ballots = await payload.find({
    collection: 'ballots',
    limit: 10000,
    depth: 0,
    req,
  })

  for (const b of ballots.docs) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ballot = b as any
    if (ballot.originLanguage) continue // already migrated

    const origin: string = ballot.language || 'de'

    await payload.update({
      collection: 'ballots',
      id: ballot.id,
      locale: origin,
      depth: 0,
      req,
      data: {
        title: ballot.title,
        description: ballot.description,
        topic: ballot.topic,
      },
    })

    await payload.update({
      collection: 'ballots',
      id: ballot.id,
      depth: 0,
      req,
      data: { originLanguage: origin },
    })

    payload.logger.info(`Ballot ${ballot.id}: migrated to locale '${origin}'`)
  }

  // ---------- OfficialArguments ----------
  const args = await payload.find({
    collection: 'imported-arguments',
    limit: 10000,
    depth: 0,
    req,
  })

  for (const a of args.docs) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arg = a as any
    if (arg.originLanguage) continue

    // No per-record language hint existed before — default to 'de' for
    // OfficialArguments, since the CMS today only holds DE Bundeskanzlei text.
    const origin = 'de'

    await payload.update({
      collection: 'imported-arguments',
      id: arg.id,
      locale: origin,
      depth: 0,
      req,
      data: {
        title: arg.title,
        body: arg.body,
      },
    })

    await payload.update({
      collection: 'imported-arguments',
      id: arg.id,
      depth: 0,
      req,
      data: { originLanguage: origin },
    })

    payload.logger.info(`OfficialArgument ${arg.id}: migrated to locale '${origin}'`)
  }
}

export async function down(_args: MigrationArgs): Promise<void> {
  // No-op: collapsing per-locale slots back into a single column would
  // lose data. Use a database snapshot for rollback.
}
