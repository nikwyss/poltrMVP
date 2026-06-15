import type { CollectionConfig, TypedLocale } from 'payload'
import { addDataAndFileToRequest } from 'payload'

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
  endpoints: [
    {
      // Bulk-Upsert offizieller Argumente aus einer hochgeladenen JSON-Datei.
      // Wird vom Ballot-Editor (components/ImportOfficialArguments.tsx) aufgerufen:
      // POST /api/imported-arguments/import
      // Body: { ballotId, items: [{id?,type,title,body,section?,documentRef?}],
      //         publish?, section?, documentRef? }
      //
      // - Eintrag MIT id  → vorhandenes offizielles Argument dieser Vorlage
      //   aktualisieren (PDS-Record bleibt am selben rkey, putRecord).
      // - Eintrag OHNE id → neu anlegen.
      // - Titel müssen je Vorlage eindeutig sein: würde der Import zwei
      //   gleiche Titel erzeugen, wird ALLES abgebrochen (nichts geschrieben).
      path: '/import',
      method: 'post',
      handler: async (req) => {
        if (!req.user) {
          return Response.json({ error: 'Nicht angemeldet.' }, { status: 401 })
        }
        await addDataAndFileToRequest(req)
        const data = (req.data || {}) as {
          ballotId?: number | string
          items?: Array<Record<string, unknown>>
          publish?: boolean
          section?: string
          documentRef?: string
        }
        const ballotId = Number(data.ballotId)
        if (!ballotId || !Array.isArray(data.items)) {
          return Response.json(
            { error: 'ballotId (Zahl) und items[] sind erforderlich.' },
            { status: 400 },
          )
        }
        const publish = data.publish !== false
        const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

        // Konfigurierte Content-Locales = Single Source of Truth (Payload-Config).
        const localization = req.payload.config.localization
        const LOCALES: string[] = localization
          ? localization.locales.map((l: { code?: string } | string) =>
              typeof l === 'string' ? l : (l.code as string),
            )
          : ['de-CH']
        const DEFAULT_LOCALE: string =
          (localization && (localization.defaultLocale as string)) || LOCALES[0] || 'de-CH'
        // Locale-Codes sind zur Laufzeit aus der Config; gegen LOCALES validiert.
        const L = (s: string) => s as TypedLocale

        type LangText = { title: string; body: string }
        type ParsedItem = {
          id?: number
          type: 'PRO' | 'CONTRA'
          originLanguage: string
          byLocale: Map<string, LangText>
          section?: string
          documentRef?: string
          primaryTitle: string
        }

        // --- 1) Felder + Sprachen validieren/parsen ----------------------
        const verr: string[] = []
        const parsed: ParsedItem[] = []
        for (let i = 0; i < data.items.length; i++) {
          const it = data.items[i]
          const label = `#${i + 1}`
          const type = String(it.type ?? '').toUpperCase().trim()
          let id: number | undefined
          const rawId = it.id
          if (rawId !== undefined && rawId !== null && rawId !== '') {
            id = Number(rawId)
            if (!Number.isInteger(id) || id <= 0) {
              verr.push(`${label}: ungültige id "${String(rawId)}".`)
              continue
            }
          }
          if (type !== 'PRO' && type !== 'CONTRA') {
            verr.push(`${label}: type muss PRO oder CONTRA sein (war "${String(it.type ?? '')}").`)
            continue
          }

          // Sprachen einsammeln: `translations` (locale → {title,body}) plus
          // flache title/body (→ originLanguage). Unbekannte Locales => Fehler.
          const byLocale = new Map<string, LangText>()
          let unknownLocale: string | null = null
          const rawTr = it.translations
          if (rawTr && typeof rawTr === 'object' && !Array.isArray(rawTr)) {
            for (const [lc, val] of Object.entries(rawTr as Record<string, unknown>)) {
              if (!LOCALES.includes(lc)) {
                unknownLocale = lc
                continue
              }
              const v = (val || {}) as Record<string, unknown>
              const t = String(v.title ?? '').trim()
              const b = String(v.body ?? '').trim()
              if (t || b) byLocale.set(lc, { title: t, body: b })
            }
          }
          const originLanguage = String(it.originLanguage ?? DEFAULT_LOCALE).trim() || DEFAULT_LOCALE
          const flatTitle = String(it.title ?? '').trim()
          const flatBody = String(it.body ?? '').trim()
          if ((flatTitle || flatBody) && LOCALES.includes(originLanguage) && !byLocale.has(originLanguage)) {
            byLocale.set(originLanguage, { title: flatTitle, body: flatBody })
          }

          if (unknownLocale) {
            verr.push(
              `${label}: Sprache "${unknownLocale}" ist nicht konfiguriert (erlaubt: ${LOCALES.join(', ')}).`,
            )
            continue
          }
          if (!LOCALES.includes(originLanguage)) {
            verr.push(
              `${label}: originLanguage "${originLanguage}" ist nicht konfiguriert (erlaubt: ${LOCALES.join(', ')}).`,
            )
            continue
          }
          const originText = byLocale.get(originLanguage)
          if (!originText || !originText.title || !originText.body) {
            verr.push(
              `${label}: title und body in der Origin-Sprache (${originLanguage}) dürfen nicht leer sein.`,
            )
            continue
          }
          let incomplete: string | null = null
          for (const [lc, v] of byLocale) {
            if (!v.title || !v.body) {
              incomplete = lc
              break
            }
          }
          if (incomplete) {
            verr.push(`${label}: Sprache ${incomplete} hat title oder body leer (beides nötig).`)
            continue
          }

          const section = ((it.section as string) || data.section || '').trim()
          const documentRef = ((it.documentRef as string) || data.documentRef || '').trim()
          parsed.push({
            id,
            type,
            originLanguage,
            byLocale,
            section: section || undefined,
            documentRef: documentRef || undefined,
            primaryTitle: (byLocale.get(DEFAULT_LOCALE) || originText).title,
          })
        }

        // --- 2) Bestehende offizielle Argumente dieser Vorlage laden -----
        const existing = await req.payload.find({
          collection: 'imported-arguments',
          where: {
            and: [{ ballot: { equals: ballotId } }, { sourceType: { equals: 'official' } }],
          },
          limit: 1000,
          depth: 0,
          locale: L(DEFAULT_LOCALE),
        })
        const existingById = new Map<number, { title: string }>()
        for (const d of existing.docs) {
          existingById.set(Number(d.id), { title: String(d.title ?? '') })
        }

        // --- 3) id-Einträge prüfen: muss offizielles Argument DIESER Vorlage sein
        const seenIds = new Set<number>()
        for (const it of parsed) {
          if (it.id === undefined) continue
          if (seenIds.has(it.id)) {
            verr.push(`Argument-id ${it.id} kommt mehrfach in der Datei vor.`)
            continue
          }
          seenIds.add(it.id)
          if (!existingById.has(it.id)) {
            verr.push(
              `id ${it.id} ("${it.primaryTitle}") ist kein offizielles Argument dieser Vorlage — Update nicht möglich.`,
            )
          }
        }

        // --- 4) Titel-Eindeutigkeit (auf Default-Locale-Titel) -----------
        const projectedTitle = new Map<number, string>()
        for (const [id, v] of existingById) projectedTitle.set(id, v.title)
        for (const it of parsed) {
          if (it.id !== undefined && existingById.has(it.id)) projectedTitle.set(it.id, it.primaryTitle)
        }
        const titleBuckets = new Map<string, string[]>()
        const bumpTitle = (t: string) => {
          const k = norm(t)
          const arr = titleBuckets.get(k) || []
          arr.push(t)
          titleBuckets.set(k, arr)
        }
        for (const t of projectedTitle.values()) bumpTitle(t)
        for (const it of parsed) if (it.id === undefined) bumpTitle(it.primaryTitle)
        for (const titles of titleBuckets.values()) {
          if (titles.length > 1) {
            verr.push(
              `Doppelter Titel würde entstehen: "${titles[0]}" (${titles.length}×). Titel müssen je Vorlage eindeutig sein.`,
            )
          }
        }

        // --- Abbruch bei Validierungsfehler: nichts schreiben ------------
        if (verr.length) {
          return Response.json(
            { error: 'Import abgebrochen (Validierung).', errors: verr, created: 0, updated: 0, published: 0 },
            { status: 400 },
          )
        }

        // --- 5) Ausführen: id → Update, sonst → Create ------------------
        //
        // CMS-Doc mit `skipPublishHook` schreiben (Hook macht NICHTS), PDS DANACH
        // explizit synchronisieren. Grund: der afterChange-Hook feuert in der
        // laufenden Transaktion und liest per findByID OHNE `req` — er sieht beim
        // Update alten Text (→ stale) bzw. scheitert bei create-with-published
        // (→ Rollback + Waise). Post-commit-Sync liest die committeten Texte
        // korrekt; der rkey bleibt bei Updates erhalten (putRecord).
        //
        // Mehrsprachig: zuerst die Origin-Sprache schreiben (inkl. nicht-
        // lokalisierter Felder), danach je weitere Locale nur title/body.
        const lib = await import('../lib/atproto-publish')
        const result = { created: 0, updated: 0, published: 0, skipped: 0, errors: [] as string[] }
        for (const it of parsed) {
          const label = it.id ? `id ${it.id}` : `"${it.primaryTitle}"`
          try {
            const originText = it.byLocale.get(it.originLanguage)!
            let docId: number
            if (it.id !== undefined) {
              await req.payload.update({
                collection: 'imported-arguments',
                id: it.id,
                locale: L(it.originLanguage),
                data: {
                  type: it.type,
                  title: originText.title,
                  body: originText.body,
                  originLanguage: L(it.originLanguage),
                  ...(it.section !== undefined ? { section: it.section } : {}),
                  ...(it.documentRef !== undefined ? { documentRef: it.documentRef } : {}),
                  ...(publish ? { status: 'published' } : {}),
                },
                context: { skipPublishHook: true },
              })
              docId = it.id
              result.updated++
            } else {
              const doc = await req.payload.create({
                collection: 'imported-arguments',
                locale: L(it.originLanguage),
                data: {
                  ballot: ballotId,
                  sourceType: 'official',
                  type: it.type,
                  title: originText.title,
                  body: originText.body,
                  originLanguage: L(it.originLanguage),
                  ...(it.section ? { section: it.section } : {}),
                  ...(it.documentRef ? { documentRef: it.documentRef } : {}),
                  status: publish ? 'published' : 'draft',
                },
                context: { skipPublishHook: true },
              })
              docId = Number(doc.id)
              result.created++
            }

            // Weitere Sprachen (nur title/body).
            for (const [lc, v] of it.byLocale) {
              if (lc === it.originLanguage) continue
              await req.payload.update({
                collection: 'imported-arguments',
                id: docId,
                locale: L(lc),
                data: { title: v.title, body: v.body },
                context: { skipPublishHook: true },
              })
            }

            // Post-commit PDS-Sync (committete Texte, ohne req).
            const fresh = await req.payload.findByID({ collection: 'imported-arguments', id: docId })
            const isPublished = (fresh as { status?: string }).status === 'published'
            const pdsUri = (fresh as { pdsUri?: string }).pdsUri
            const pdsCid = (fresh as { pdsCid?: string }).pdsCid
            if (isPublished && pdsUri) {
              const { cid } = await lib.updateImportedArgument(req.payload, fresh)
              if (cid && cid !== pdsCid) {
                await req.payload.update({
                  collection: 'imported-arguments',
                  id: docId,
                  data: { pdsCid: cid },
                  context: { skipPublishHook: true },
                })
              }
              result.published++
            } else if (isPublished && !pdsUri) {
              const { uri, cid } = await lib.publishImportedArgument(req.payload, fresh)
              await req.payload.update({
                collection: 'imported-arguments',
                id: docId,
                data: { pdsUri: uri, pdsCid: cid },
                context: { skipPublishHook: true },
              })
              result.published++
            }
          } catch (err) {
            result.errors.push(`${label}: ${err instanceof Error ? err.message : String(err)}`)
          }
        }
        return Response.json(result)
      },
    },
  ],
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
      defaultValue: 'de-CH',
      options: [
        { label: 'Deutsch', value: 'de-CH' },
        { label: 'Français', value: 'fr-CH' },
        { label: 'Italiano', value: 'it-CH' },
        { label: 'Rumantsch', value: 'rm' },
        { label: 'English', value: 'en-GB' },
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
