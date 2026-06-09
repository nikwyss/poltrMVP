/**
 * Supported content languages for POLTR records (indexer side).
 *
 * Mirrors services/appview/src/core/languages.py — read from POLTR_LANGUAGES
 * env var so adding/removing a language is a config edit, not a code change.
 */

export const SUPPORTED_LANGUAGES = (process.env.POLTR_LANGUAGES || "de-CH,fr-CH,it-CH,rm,en-GB")
  .split(",")
  .map((c) => c.trim())
  .filter(Boolean);

export const DEFAULT_LANGUAGE = process.env.POLTR_DEFAULT_LANGUAGE || "de-CH";

export const SUPPORTED_LANGUAGES_SET = new Set(SUPPORTED_LANGUAGES);
