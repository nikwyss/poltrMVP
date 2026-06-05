import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'

export const Ballots: CollectionConfig = {
  slug: 'ballots',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'voteDate', 'status', 'actions', 'updatedAt'],
    listSearchableFields: ['title', 'topic'],
  },
  access: {
    read: () => true,
    create: ({ req: { user } }) => !!user,
    update: ({ req: { user } }) => !!user,
    delete: ({ req: { user } }) => !!user,
  },
  fields: [
    {
      name: 'rkey',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        description: 'Official BK number (Bundeskanzlei). E.g. "663" or "133.3" for counter-proposals. Used for the governance account handle — dots are replaced with hyphens (e.g. "133.3" → ballot-133-3.id.poltr.ch).',
      },
      validate: (value: unknown) => {
        if (typeof value !== 'string') return 'rkey is required'
        if (!/^[0-9]+(\.[0-9]+)?$/.test(value)) {
          return 'rkey must be a BK number (e.g. "663" or "133.3")'
        }
        return true
      },
    },
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
    },
    {
      name: 'description',
      type: 'richText',
      localized: true,
    },
    {
      name: 'topic',
      type: 'text',
      localized: true,
      admin: {
        description: 'Themenbereich (z.B. Umwelt, Soziales)',
      },
    },
    {
      name: 'ballotType',
      type: 'select',
      options: [
        { label: 'Obligatorisches Referendum', value: 'obligatorisches_referendum' },
        { label: 'Fakultatives Referendum', value: 'fakultatives_referendum' },
        { label: 'Volksinitiative', value: 'volksinitiative' },
        { label: 'Direkter Gegenentwurf', value: 'direkter_gegenentwurf' },
        { label: 'Stichfrage', value: 'stichfrage' },
      ],
      admin: {
        description: 'Rechtsform der Vorlage (gemäss swissvotes.ch)',
      },
    },
    {
      name: 'voteDate',
      type: 'date',
      required: true,
      admin: {
        date: {
          pickerAppearance: 'dayOnly',
          displayFormat: 'dd.MM.yyyy',
        },
        description: 'Abstimmungsdatum',
      },
    },
    {
      name: 'officialRef',
      type: 'text',
      admin: {
        description: 'Referenz auf offizielle Unterlagen (URL)',
      },
    },
    {
      // Quelle der ursprünglichen Texterstellung (z.B. amtssprache der Bundeskanzlei-
      // Vorlage). Die Edit-Maske bietet via Payload-Localization einen Sprach-
      // Switcher für alle Locales; `originLanguage` markiert, welche davon der
      // Quelltext ist. Frontend nutzt das für "Original auf X / Übersetzt"-Badges.
      name: 'originLanguage',
      type: 'select',
      required: true,
      defaultValue: 'de',
      options: [
        { label: 'Deutsch', value: 'de' },
        { label: 'Français', value: 'fr' },
        { label: 'Italiano', value: 'it' },
        { label: 'Rumantsch', value: 'rm' },
        { label: 'English', value: 'en' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      // Virtual sidebar widget: shows DE ✓ FR ✓ IT ✗ RM ✗ EN ✓ for the doc.
      name: 'translationStatus',
      type: 'ui',
      label: 'Übersetzungs-Status',
      admin: {
        position: 'sidebar',
        components: {
          Field: '/components/TranslationStatus#TranslationStatusField',
        },
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' },
        { label: 'Archived', value: 'archived' },
      ],
      admin: {
        position: 'sidebar',
        description:
          'Nur draft/published werden vom Calculator codiert; archived nicht.',
      },
    },
    {
      name: 'governanceDid',
      type: 'text',
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'ATProto Governance Account DID (auto-created on publish — reload the page after publishing to see the value).',
      },
    },
    {
      name: 'governanceHandle',
      type: 'text',
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'ATProto Governance Account Handle (auto-created on publish — reload the page after publishing to see the value).',
      },
    },
    {
      // Virtual field: renders per-row "Bearbeiten" + "Argumente" actions in
      // the list view (no stored data). See components/BallotRowActions.tsx.
      name: 'actions',
      type: 'ui',
      label: 'Aktionen',
      admin: {
        components: {
          Cell: '/components/BallotRowActions#BallotRowActions',
        },
      },
    },
    {
      // Themen-Hierarchie (Calculator/top-down): Vorschau bauen, vergleichen,
      // übernehmen, Community einsortieren, wachsen lassen. Read/Write gegen den
      // Calculator-Service. Siehe components/TaxonomyPanel.tsx.
      name: 'taxonomy',
      type: 'ui',
      label: 'Themen-Hierarchie',
      admin: {
        components: {
          Field: '/components/TaxonomyPanel#TaxonomyPanelField',
        },
      },
    },
  ],
  hooks: {
    afterChange: [
      async ({ doc, req, context }) => {
        // Skip recursive invocations from the inner payload.update() below.
        if (context?.skipPublishHook) return doc

        const isPublishing =
          doc.status === 'published' && !doc.governanceDid

        if (!isPublishing) return doc

        const { publishGovernanceAccount, HandleAlreadyTakenError } = await import(
          '../lib/atproto-publish'
        )

        try {
          const { did, handle } = await publishGovernanceAccount(doc.rkey)

          // Update the document with governance account info — share the
          // outer transaction (via `req`) and tag the call with a context
          // flag so this hook short-circuits on the recursive afterChange.
          await req.payload.update({
            collection: 'ballots',
            id: doc.id,
            data: {
              governanceDid: did,
              governanceHandle: handle,
            },
            req,
            context: { skipPublishHook: true },
          })

          req.payload.logger.info(
            `Governance account created for ballot ${doc.id}: ${handle} (${did})`
          )
        } catch (err) {
          req.payload.logger.error(
            `Failed to create governance account for ballot ${doc.id}: ${err}`
          )
          if (err instanceof HandleAlreadyTakenError) {
            throw new APIError(
              `Governance-Account konnte nicht angelegt werden: Handle "${err.handle}" ist auf dem PDS bereits vergeben (vermutlich Waise aus einem früheren, halbgelungenen Save). Bitte den PDS-Account löschen oder in auth.governance_accounts adoptieren.`,
              409,
              undefined,
              true,
            )
          }
          const msg = err instanceof Error ? err.message : String(err)
          throw new APIError(
            `Governance-Account konnte nicht angelegt werden: ${msg}`,
            500,
            undefined,
            true,
          )
        }

        return doc
      },
    ],
  },
}
