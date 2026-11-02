/** Lower-cased with the accents off, so `μαρια` finds `Μαρία`. */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}
