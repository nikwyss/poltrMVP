// Payload migration index — currently empty.
//
// The Localization schema diff (locales tables + origin_language columns)
// was applied manually via infra/scripts/cms-postgres/migrate-localization.sql
// because the CMS DB was previously managed in dev-push mode (no baseline
// migration). Once we want a proper migrations pipeline, the first entry
// here should be a baseline that captures the current schema state.

export const migrations: never[] = [];
