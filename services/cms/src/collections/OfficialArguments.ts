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
export const OfficialArguments: CollectionConfig = {
  slug: 'imported-arguments',
  labels: {
    singular: 'Offizielles Argument',
    plural: 'Offizielle Argumente',
  },
  // Audit trail: every change to an official argument is versioned (author +
  // timestamp). Publication is governed by the `status` field below, so the
  // built-in draft system stays off.
  versions: { drafts: false },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'ballot', 'sourceType', 'type', 'status', 'updatedAt'],
    listSearchableFields: ['title', 'body'],
    // Kein eigener Sidebar-Eintrag / keine Standalone-Routen mehr: offizielle
    // Argumente werden im Ballot-Editor im Tab „Offizielle Argumente" (join-Feld)
    // angelegt und bearbeitet. Das join-Drawer funktioniert trotz `hidden`.
    hidden: true,
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
      localized: true,
    },
    {
      name: 'body',
      type: 'textarea',
      required: true,
      maxLength: 10000,
      localized: true,
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
        description:
          'Quellsprache des Arguments. Bestimmt, welche Locale beim Publish als Original (Top-Level title/body + langs) in den ATProto-Record geht; alle übrigen befüllten Locales landen als translations[].',
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
      async ({ doc, req, operation, context }) => {
        // Skip recursive invocations triggered by the inner payload.update()
        // calls below — they share the outer transaction (via `req`) and
        // would otherwise re-enter this hook.
        if (context?.skipPublishHook) return doc

        const isPublished = doc.status === 'published'
        const alreadyOnPds = !!doc.pdsUri

        try {
          const lib = await import('../lib/atproto-publish')

          if (isPublished && !alreadyOnPds) {
            // First publish → create the record on the PDS.
            const { uri, cid } = await lib.publishImportedArgument(req.payload, doc)
            await req.payload.update({
              collection: 'imported-arguments',
              id: doc.id,
              data: { pdsUri: uri, pdsCid: cid },
              req,
              context: { skipPublishHook: true },
            })
            req.payload.logger.info(`Imported argument ${doc.id} published to PDS: ${uri}`)
          } else if (isPublished && alreadyOnPds) {
            // Edit of a published record → keep the public PDS record in sync.
            const { cid } = await lib.updateImportedArgument(req.payload, doc)
            if (cid && cid !== doc.pdsCid) {
              await req.payload.update({
                collection: 'imported-arguments',
                id: doc.id,
                data: { pdsCid: cid },
                req,
                context: { skipPublishHook: true },
              })
            }
            req.payload.logger.info(`Imported argument ${doc.id} updated on PDS`)
          } else if (!isPublished && alreadyOnPds) {
            // Set back to draft → unpublish (remove from PDS) so "published in
            // the CMS" stays equivalent to "publicly visible".
            await lib.deleteImportedArgument(req.payload, doc)
            await req.payload.update({
              collection: 'imported-arguments',
              id: doc.id,
              data: { pdsUri: null, pdsCid: null },
              req,
              context: { skipPublishHook: true },
            })
            req.payload.logger.info(`Imported argument ${doc.id} unpublished from PDS`)
          }
        } catch (err) {
          req.payload.logger.error(`Failed to sync imported argument ${doc.id} to PDS: ${err}`)
          // On a failed *first* publish, roll status back so the user notices.
          if (operation === 'update' && isPublished && !alreadyOnPds) {
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
    afterDelete: [
      async ({ doc, req }) => {
        // Remove the corresponding PDS record so a deleted official argument
        // stops being served publicly.
        if (!doc?.pdsUri) return
        try {
          const { deleteImportedArgument } = await import('../lib/atproto-publish')
          await deleteImportedArgument(req.payload, doc)
          req.payload.logger.info(`Imported argument ${doc.id} deleted from PDS`)
        } catch (err) {
          req.payload.logger.error(`Failed to delete imported argument ${doc.id} from PDS: ${err}`)
        }
      },
    ],
  },
}
