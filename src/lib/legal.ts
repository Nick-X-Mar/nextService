/**
 * The date of the current Όροι Χρήσης and Πολιτική Απορρήτου. It is shown as
 * their «Τελευταία ενημέρωση» and stored on every new account as
 * `acceptedTermsVersion` — the record of which text that user agreed to.
 *
 * Change it in the same edit as any change of substance to either text
 * (src/data/content/pages.ts). An admin edit in /admin/content carries its own
 * timestamp but does not move this version — substantive legal changes belong
 * in the shipped text.
 */
export const LEGAL_TEXT_DATE = '2026-10-27'

export const TERMS_VERSION = LEGAL_TEXT_DATE
