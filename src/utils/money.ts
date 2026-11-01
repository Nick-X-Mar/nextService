/** `1234.5` → `"1.234,50€"`: the payments pages' money figures, always to the cent. */
export function euro(value: number): string {
  return `${value.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€`
}
