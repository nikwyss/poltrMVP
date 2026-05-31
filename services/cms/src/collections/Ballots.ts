import type { CollectionConfig } from 'payload'

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
        description: 'Official BK number (Bundeskanzlei). E.g. "663" or "133.3" for counter-proposals. Used for governance account handle (ballot-{rkey}.id.poltr.ch).',
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
    },
    {
      name: 'description',
      type: 'richText',
    },
    {
      name: 'topic',
      type: 'text',
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
      name: 'language',
      type: 'select',
      defaultValue: 'de',
      options: [
        { label: 'Deutsch', value: 'de' },
        { label: 'Français', value: 'fr' },
        { label: 'Italiano', value: 'it' },
        { label: 'English', value: 'en' },
      ],
      admin: {
        position: 'sidebar',
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
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'governanceDid',
      type: 'text',
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'ATProto Governance Account DID (auto-created on publish)',
      },
    },
    {
      name: 'governanceHandle',
      type: 'text',
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'ATProto Governance Account Handle',
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
  ],
  hooks: {
    afterChange: [
      async ({ doc, req, context }) => {
        // Skip recursive invocations from the inner payload.update() below.
        if (context?.skipPublishHook) return doc

        const isPublishing =
          doc.status === 'published' && !doc.governanceDid

        if (!isPublishing) return doc

        try {
          const { publishGovernanceAccount } = await import('../lib/atproto-publish')
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
        }

        return doc
      },
    ],
  },
}
