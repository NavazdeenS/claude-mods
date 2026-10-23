// A small pixel canvas, drawn into cells two pixel rows at a time with half blocks.
import { type Canvas, isBlank, paint, write } from './canvas'

/** `w` × `h` pixels, row-major; undefined is transparent. */
export type Pix = { w: number; h: number; px: (string | undefined)[] }

export const pixels = (w: number, h: number): Pix => ({ w, h, px: Array<string | undefined>(Math.max(0, w * h)).fill(undefined) })

export function set(p: Pix, x: number, y: number, color: string): void {
  if (x >= 0 && x < p.w && y >= 0 && y < p.h) p.px[y * p.w + x] = color
}

export const get = (p: Pix, x: number, y: number): string | undefined =>
  x >= 0 && x < p.w && y >= 0 && y < p.h ? p.px[y * p.w + x] : undefined

/** Fills the rectangle (x0, y0)–(x1, y1), inclusive, clipped. */
export function rect(p: Pix, x0: number, y0: number, x1: number, y1: number, color: string): void {
  for (let y = Math.max(0, y0); y <= Math.min(p.h - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(p.w - 1, x1); x++) p.px[y * p.w + x] = color
  }
}

/**
 * Draws the pixels into the canvas from cell (left, top): pixel rows 2y and
 * 2y+1 make cell row top+y. An empty cell becomes `▀` (top as foreground,
 * bottom as background) or a plain background; a cell that already holds
 * something keeps it and takes the lower pixel as its background.
 */
export function blit(c: Canvas, p: Pix, left: number, top: number): void {
  for (let cy = 0; cy * 2 < p.h; cy++) {
    for (let x = 0; x < p.w; x++) {
      const a = get(p, x, cy * 2)
      const b = get(p, x, cy * 2 + 1)
      const cx = left + x
      const y = top + cy
      if (a === undefined && b === undefined) continue
      if (!isBlank(c, cx, y)) paint(c, cx, y, (b ?? a) as string)
      else if (a !== undefined && b !== undefined) {
        if (a === b) paint(c, cx, y, a)
        else write(c, cx, y, '▀', { fg: a, bg: b })
      } else if (a !== undefined) write(c, cx, y, '▀', { fg: a })
      else write(c, cx, y, '▄', { fg: b })
    }
  }
}

/** A cell's upper and lower pixel colours, read from its half blocks; undefined is the terminal's own background. */
export function halves(c: Canvas, x: number, y: number): [string | undefined, string | undefined] {
  const cell = c.cells[y]?.[x]
  if (!cell) return [undefined, undefined]
  const { ch, style } = cell
  if (ch === '█') return [style.fg, style.fg]
  if (ch === '▀') return [style.fg, style.bg]
  if (ch === '▄') return [style.bg, style.fg]
  return [style.bg, style.bg]
}

/** True when pixel row `py` of column `x` has something drawn in it: a half block's half, or any other glyph. */
export function isSolid(c: Canvas, x: number, py: number): boolean {
  const cell = c.cells[py >> 1]?.[x]
  if (!cell || cell.ch === ' ') return false
  if (cell.ch === '▀') return py % 2 === 0
  if (cell.ch === '▄') return py % 2 === 1
  return true
}

/**
 * Sets one pixel, pixel row `py` being the upper (even) or lower (odd) half
 * of cell row py/2, and keeps the cell's other half. A cell that held some
 * other glyph gives it up and keeps its background.
 */
export function plot(c: Canvas, x: number, py: number, color: string): void {
  const y = py >> 1
  if (py < 0 || y >= c.h || x < 0 || x >= c.w) return
  const [t0, b0] = halves(c, x, y)
  const top = py % 2 === 0 ? color : t0
  const bot = py % 2 === 1 ? color : b0
  const row = c.cells[y]
  if (!row) return
  if (top === bot) row[x] = { ch: '█', style: { fg: top, bg: top } }
  else if (top !== undefined) row[x] = { ch: '▀', style: bot === undefined ? { fg: top } : { fg: top, bg: bot } }
  else row[x] = { ch: '▄', style: { fg: bot } }
}
