import type { CollectionConfig } from 'payload'
import { APIError, addDataAndFileToRequest } from 'payload'
import { publishTaxonomySnapshot } from '../lib/atproto-publish'

export const Ballots: CollectionConfig = {
  slug: 'ballots',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'voteDate', 'status', 'actions', 'updatedAt'],
    listSearchableFields: ['title', 'topic'],
    components: {
      edit: {
        // Status-Select links neben den Save/Publish-Buttons (gilt übergreifend).
        beforeDocumentControls: ['/components/BallotStatusControl#BallotStatusControl'],
      },
    },
  },
  access: {
    read: () => true,
    create: ({ req: { user } }) => !!user,
    update: ({ req: { user } }) => !!user,
    delete: ({ req: { user } }) => !!user,
  },
  endpoints: [
    {
      // Versionierten Taxonomie-Snapshot veröffentlichen. Wird vom Ballot-Editor
      // (components/TaxonomyPanel.tsx) NACH erfolgreichem „Persistieren" aufgerufen:
      // POST /api/ballots/taxonomy-snapshot  Body: { ballotRkey }
      //
      // Schreibt den persistierten Baum als unveränderlichen
      // app.ch.poltr.taxonomy.snapshot-Record auf das Governance-Konto des Ballots
      // (append-only) und indexiert ihn in app_taxonomy_snapshot. Unveränderter Baum
      // → kein neuer Record (Dedup über Content-Hash).
      path: '/taxonomy-snapshot',
      method: 'post',
      handler: async (req) => {
        if (!req.user) {
          return Response.json({ error: 'Nicht angemeldet.' }, { status: 401 })
        }
        await addDataAndFileToRequest(req)
        const ballotRkey = String((req.data as { ballotRkey?: unknown })?.ballotRkey ?? '').trim()
        if (!ballotRkey) {
          return Response.json({ error: 'ballotRkey ist erforderlich.' }, { status: 400 })
        }
        try {
          const result = await publishTaxonomySnapshot(ballotRkey)
          return Response.json(result)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          req.payload.logger.error(`taxonomy-snapshot fehlgeschlagen (${ballotRkey}): ${message}`)
          return Response.json({ error: message }, { status: 500 })
        }
      },
    },
  ],
  fields: [
    // --- Sidebar fields (rendered in the sidebar across all tabs) ---
    {
      // Quellsprache der CMS-Inhalte — FIX Deutsch (CMS-Content wird immer auf
      // Deutsch erfasst). Kein editierbares Dropdown mehr: hardcodiert auf 'de'
      // und ausgeblendet. Bleibt als Datenfeld erhalten, damit Frontend/AppView
      // die "Original auf X / Übersetzt"-Badges weiter lesen können. Sichtbar nur
      // als Seitenbemerkung (originLanguageNote, s.u.).
      name: 'originLanguage',
      type: 'select',
      required: true,
      defaultValue: 'de-CH',
      options: [
        { label: 'Deutsch', value: 'de-CH' },
        { label: 'Français', value: 'fr-CH' },
        { label: 'Italiano', value: 'it-CH' },
        { label: 'Rumantsch', value: 'rm' },
        { label: 'English', value: 'en-GB' },
      ],
      admin: {
        hidden: true,
      },
    },
    {
      // Seitenbemerkung in der Sidebar: zeigt die fixe Quellsprache (Deutsch).
      name: 'originLanguageNote',
      type: 'ui',
      admin: {
        position: 'sidebar',
        components: {
          Field: '/components/OriginLanguageNote#OriginLanguageNote',
        },
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
      // Übergreifender Status. Wird NICHT in der Sidebar gerendert (hidden),
      // sondern über `admin.components.beforeDocumentControls` als Select links
      // neben den Save/Publish-Buttons (siehe components/BallotStatusControl.tsx).
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
        hidden: true,
        description:
          'Nur draft/published werden vom Calculator codiert; archived nicht.',
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
    // --- Main content: three tabs (unnamed → data stays flat, no migration) ---
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Allgemein',
          description: 'Status, Texte und Beschreibung der Vorlage.',
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
              name: 'governanceDid',
              type: 'text',
              admin: {
                readOnly: true,
                description:
                  'ATProto Governance Account DID (auto-created on publish — reload the page after publishing to see the value).',
              },
            },
            {
              name: 'governanceHandle',
              type: 'text',
              admin: {
                readOnly: true,
                description:
                  'ATProto Governance Account Handle (auto-created on publish — reload the page after publishing to see the value).',
              },
            },
          ],
        },
        {
          label: 'Offizielle Argumente',
          description:
            'Kuratierte PRO/CONTRA-Argumente (Bundeskanzlei etc.). Hier direkt anlegen und bearbeiten — auf "Published" gesetzte Argumente werden auf den PDS geschrieben.',
          fields: [
            {
              // Import-Werkzeug: JSON-Datei mit offiziellen Argumenten hochladen
              // + Vorlage herunterladen. Ruft POST /api/imported-arguments/import.
              // Siehe components/ImportOfficialArguments.tsx.
              name: 'importOfficialArguments',
              type: 'ui',
              label: 'Import',
              admin: {
                components: {
                  Field: '/components/ImportOfficialArguments#ImportOfficialArguments',
                },
              },
            },
            {
              // Reverse-Relationship auf imported-arguments.ballot: zeigt die
              // zugehörigen offiziellen Argumente inline an, mit "Create New"
              // (Drawer öffnet vorbefüllt mit dieser Vorlage). Siehe
              // collections/OfficialArguments.ts.
              name: 'officialArguments',
              type: 'join',
              label: 'Offizielle Argumente',
              collection: 'imported-arguments',
              on: 'ballot',
              defaultLimit: 50,
              admin: {
                defaultColumns: ['type', 'title', 'status', 'updatedAt'],
                description:
                  'Verknüpfte offizielle Argumente. Zum Bearbeiten anklicken oder oben rechts neu anlegen.',
              },
            },
          ],
        },
        {
          label: 'Themen-Hierarchie',
          description:
            'Themen-Hierarchie (Calculator/top-down): Vorschau bauen, vergleichen, übernehmen, Community einsortieren, wachsen lassen.',
          fields: [
            {
              // Themen-Hierarchie (Calculator/top-down): Vorschau bauen,
              // vergleichen, übernehmen, Community einsortieren, wachsen
              // lassen. Read/Write gegen den Calculator-Service. Siehe
              // components/TaxonomyPanel.tsx.
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
        },
      ],
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
