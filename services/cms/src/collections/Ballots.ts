import type { CollectionConfig } from 'payload'

export const Ballots: CollectionConfig = {
  slug: 'ballots',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'voteDate', 'status', 'governanceDid', 'updatedAt'],
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
  ],
  hooks: {
    afterChange: [
      async ({ doc, previousDoc, operation, req }) => {
        const isPublishing =
          doc.status === 'published' && !doc.governanceDid

        if (!isPublishing) return doc

        try {
          const { publishGovernanceAccount } = await import('../lib/atproto-publish')
          const { did, handle } = await publishGovernanceAccount(String(doc.id))

          // Update the document with governance account info
          await req.payload.update({
            collection: 'ballots',
            id: doc.id,
            data: {
              governanceDid: did,
              governanceHandle: handle,
            },
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
