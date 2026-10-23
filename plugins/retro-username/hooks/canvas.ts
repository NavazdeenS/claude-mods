// A grid of single-width cells with a style each, drawn as runs of Text.
export type Style = { fg?: string; bg?: string; bold?: boolean; dim?: boolean }
export type Cell = { ch: string; style: Style }
export type Canvas = { w: number; h: number; cells: Cell[][] }
export type Run = { text: string; style: Style }

export const blank = (w: number, h: number): Canvas => ({
  w,
  h,
  cells: Array.from({ length: h }, () => Array.from({ length: w }, () => ({ ch: ' ', style: {} }))),
})

/** Writes `text` from (x, y), one cell per character, clipped to the grid. A style without `bg` keeps the cell's background. */
export function write(c: Canvas, x: number, y: number, text: string, style: Style = {}): void {
  const row = c.cells[y]
  if (!row) return
  ;[...text].forEach((ch, i) => {
    const cx = x + i
    if (cx < 0 || cx >= c.w) return
    const under = row[cx]?.style.bg
    row[cx] = { ch, style: style.bg === undefined && under !== undefined ? { ...style, bg: under } : style }
  })
}

/** Sets a cell's background, keeping its character and other style. */
export function paint(c: Canvas, x: number, y: number, bg: string): void {
  const cell = c.cells[y]?.[x]
  if (cell) cell.style = { ...cell.style, bg }
}

/** True for an empty cell on the grid. */
export const isBlank = (c: Canvas, x: number, y: number): boolean => c.cells[y]?.[x]?.ch === ' '

/** The character at (x, y), or undefined off the grid. */
export const at = (c: Canvas, x: number, y: number): string | undefined => c.cells[y]?.[x]?.ch

const key = (s: Style) => `${s.fg ?? ''}|${s.bg ?? ''}|${s.bold ? 1 : 0}|${s.dim ? 1 : 0}`

/** A row as runs of equal style, so a row draws as a handful of Text spans. */
export function runs(row: readonly Cell[]): Run[] {
  const out: Run[] = []
  for (const cell of row) {
    const last = out[out.length - 1]
    if (last && key(last.style) === key(cell.style)) last.text += cell.ch
    else out.push({ text: cell.ch, style: cell.style })
  }
  return out
}

/** A row's plain text. */
export const rowText = (c: Canvas, y: number): string => (c.cells[y] ?? []).map(cell => cell.ch).join('')
