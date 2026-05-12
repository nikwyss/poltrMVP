import type { CollectionConfig } from 'payload'

/**
 * Curated arguments that originate outside the platform: today the
 * Bundeskanzlei leaflet (sourceType='official'); later parties / NGOs
 * (sourceType='organization').
 *
 * The status=published transition triggers a publish hook that writes
 * the record into the ballot's governance PDS account so it shows up
 * alongside user-submitted arguments via the same firehose-driven path.
 */
export const ImportedArguments: CollectionConfig = {
  slug: 'imported-arguments',
  labels: {
    singular: 'Imported Argument',
    plural: 'Imported Arguments',
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'ballot', 'sourceType', 'type', 'status', 'updatedAt'],
    listSearchableFields: ['title', 'body'],
  },
  access: {
    read: () => true,
    create: ({ req: { user } }) => !!user,
    update: ({ req: { user } }) => !!user,
    delete: ({ req: { user } }) => !!user,
  },
  fields: [
    {
      name: 'ballot',
      type: 'relationship',
      relationTo: 'ballots',
      required: true,
      admin: {
        description: 'Zugehörige Abstimmungsvorlage.',
      },
    },
    {
      name: 'sourceType',
      type: 'select',
      required: true,
      defaultValue: 'official',
      options: [
        { label: 'Offiziell (Bundeskanzlei)', value: 'official' },
        // 'organization' ist im Lexicon & DB reserviert, aber noch nicht
        // wired-up (kein CMS-Organizations-Collection). Hier auskommentiert
        // lassen bis die Org-Variante implementiert wird.
        // { label: 'Organisation', value: 'organization' },
      ],
      admin: {
        description: 'Quelltyp. Aktuell nur "Offiziell" verfügbar; "Organisation" folgt später.',
      },
    },
    {
      name: 'type',
      type: 'select',
      required: true,
      options: [
        { label: 'PRO', value: 'PRO' },
        { label: 'CONTRA', value: 'CONTRA' },
      ],
    },
    {
      name: 'title',
      type: 'text',
      required: true,
      maxLength: 300,
    },
    {
      name: 'body',
      type: 'textarea',
      required: true,
      maxLength: 10000,
    },
    {
      name: 'documentRef',
      type: 'text',
      admin: {
        description: 'URL zur Originalquelle (Leaflet PDF, Webseite).',
      },
    },
    {
      name: 'section',
      type: 'text',
      admin: {
        description: 'Optional: Kapitel/Seite in der Quelle, z.B. "Argumente Befürworter, S. 14".',
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
        description: 'Auf "Published" setzen, um den Record auf den PDS zu schreiben.',
      },
    },
    {
      name: 'pdsUri',
      type: 'text',
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'AT URI des Records (nach Publish).',
      },
    },
    {
      name: 'pdsCid',
      type: 'text',
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
  ],
  hooks: {
    afterChange: [
      async ({ doc, previousDoc, req, operation, context }) => {
        // Skip recursive invocations triggered by the inner payload.update()
        // calls below — they share the outer transaction (via `req`) and
        // would otherwise re-enter this hook.
        if (context?.skipPublishHook) return doc

        // Publish on first transition to 'published' that hasn't been published yet.
        const wasPublished = previousDoc?.status === 'published'
        const isPublished = doc.status === 'published'
        const justPublished =
          isPublished && !wasPublished && !doc.pdsUri

        if (!justPublished) return doc

        try {
          const { publishImportedArgument } = await import('../lib/atproto-publish')
          const { uri, cid } = await publishImportedArgument(req.payload, doc)

          await req.payload.update({
            collection: 'imported-arguments',
            id: doc.id,
            data: { pdsUri: uri, pdsCid: cid },
            req,
            context: { skipPublishHook: true },
          })

          req.payload.logger.info(
            `Imported argument ${doc.id} published to PDS: ${uri}`,
          )
        } catch (err) {
          req.payload.logger.error(
            `Failed to publish imported argument ${doc.id}: ${err}`,
          )
          // Roll status back to draft so the user notices something went wrong.
          if (operation === 'update') {
            await req.payload.update({
              collection: 'imported-arguments',
              id: doc.id,
              data: { status: 'draft' },
              req,
              context: { skipPublishHook: true },
            })
          }
        }

        return doc
      },
    ],
  },
}
