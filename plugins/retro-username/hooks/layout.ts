// The band as one canvas: sky, name banner, a ledge, three bars, and a yard
// on the right, with the platforms the pet can stand on.
import type { PlatformId } from '../types'
import { barCells, barColor } from './bar'
import { type Canvas, blank, write } from './canvas'
import { banner, bannerWidth } from './font'
import { BODIES, type Body, DEFAULT_STYLE, MAX_H } from './sprites'

export const GRADIENT = ['#ff2bd6', '#ff4fa3', '#ff7a6b', '#ffa640', '#ffd319']
export const BAR_CELLS = 24
export const BAR_X = 8

export type { PlatformId }
export type Bar = { label: string; percent?: number; tail?: string }
/** The pixel row `y` of the feet (two per cell row); the pet's left edge may stand from `x0` to `x1`. */
export type Platform = {
  id: PlatformId
  y: number
  x0: number
  x1: number
  /** Where the pet may stand, when not every column between x0 and x1 has ground under its feet. */
  footholds?: number[]
}
export type Spot = { x: number; platform: PlatformId }
export type World = {
  w: number
  h: number
  /** The pet's body, which the platforms' spans and spots are laid out for. */
  body: Body
  platforms: Platform[]
  bench: Spot
  bowl?: Spot
  bed?: Spot
  /** The yard's span and the cell row things stand in (the ball, bowl, gift), when there is a yard. */
  yard?: { x0: number; x1: number; y: number }
}

// Rows of the roomy layout: sky enough above the name for the tallest pet,
// and below it a girder in the bottom half of its row, leaving the tallest
// pet exactly enough pixels between the name and the girder.
const BANNER_TOP = Math.ceil((MAX_H + 1) / 2)
const GIRDER = BANNER_TOP + 5 + Math.floor(MAX_H / 2)
const BARS_TOP = GIRDER + 1
export const ROOMY_ROWS = BARS_TOP + 3
/** The top pixel of the name's letters and of the girder. */
const PERCH_TOP = BANNER_TOP * 2
const GIRDER_TOP = GIRDER * 2 + 1
export const SNUG_ROWS = 8
const YARD_MIN = 18

const barWidth = (b: Bar) => BAR_X + BAR_CELLS + (b.percent === undefined ? 3 : ` ${Math.round(b.percent)}%`.length) + (b.tail ? ` · ${b.tail}`.length : 0)

/** Columns the banner and bars need, before any yard. */
export const contentWidth = (name: string, bars: readonly Bar[]) => Math.max(bannerWidth(name), ...bars.map(barWidth))

function drawBar(c: Canvas, y: number, b: Bar): void {
  write(c, 0, y, b.label.padEnd(8), { fg: '#00e5ff', bold: true })
  if (b.percent === undefined) {
    write(c, BAR_X, y, `${'░'.repeat(BAR_CELLS)} --`, { dim: true })
    return
  }
  const { filled, empty } = barCells(b.percent, BAR_CELLS)
  const color = barColor(b.percent)
  write(c, BAR_X, y, filled, { fg: color, bold: true })
  write(c, BAR_X + filled.length, y, empty, { dim: true })
  const pct = ` ${Math.round(b.percent)}%`
  write(c, BAR_X + BAR_CELLS, y, pct, { fg: color, bold: true })
  if (b.tail) write(c, BAR_X + BAR_CELLS + pct.length, y, ` · ${b.tail}`, { dim: true })
}

/**
 * Lays the band out in `w` columns. Roomy (13 rows) adds the sky above the name
 * and a brick girder above the bars for the pet to stand on; snug (8 rows) is
 * banner and bars alone, with no world.
 */
export function layout(name: string, bars: readonly Bar[], w: number, isRoomy: boolean, body: Body = BODIES[DEFAULT_STYLE]): { canvas: Canvas; world?: World } {
  const h = isRoomy ? ROOMY_ROWS : SNUG_ROWS
  const c = blank(w, h)
  const top = isRoomy ? BANNER_TOP : 0
  banner(name).forEach((row, i) => write(c, 0, top + i, row, { fg: GRADIENT[i], bold: true }))
  const barsTop = isRoomy ? BARS_TOP : 5
  bars.forEach((b, i) => drawBar(c, barsTop + i, b))
  if (!isRoomy) return { canvas: c }

  const content = contentWidth(name, bars)
  const yardX0 = content + 3
  const hasYard = w - yardX0 >= YARD_MIN

  // The girder runs from the left edge to the yard's fence (or the band's edge).
  const girderEnd = hasYard ? yardX0 - 3 : w - 1
  for (let x = 0; x <= girderEnd; x++) write(c, x, GIRDER, '▄', { fg: x % 4 === 3 ? '#fc9838' : '#c84c0c' })

  // On the name, the pet stands only where a letter is under every foot.
  const tops = c.cells[BANNER_TOP] ?? []
  const footholds: number[] = []
  for (let x = 0; x + body.w - 1 < tops.length; x++) {
    if (body.feet.every(f => tops[x + f]?.ch !== ' ')) footholds.push(x)
  }
  const platforms: Platform[] = [{ id: 'ledge', y: GIRDER_TOP - 1, x0: 0, x1: Math.max(0, girderEnd - body.w + 1) }]
  if (footholds.length > 0) {
    platforms.unshift({ id: 'perch', y: PERCH_TOP - 1, x0: footholds[0] ?? 0, x1: footholds[footholds.length - 1] ?? 0, footholds })
  }
  const world: World = { w, h, body, platforms, bench: { x: BAR_X + Math.floor((BAR_CELLS - body.w) / 2), platform: 'ledge' } }

  if (hasYard) {
    // The ground's top pixel is the top half of the last row; things stand in the row above.
    const groundTop = (h - 1) * 2
    const rowY = h - 2
    const yardX1 = w - 1
    platforms.push({ id: 'floor', y: groundTop - 1, x0: yardX0, x1: yardX1 - body.w })
    for (let y = 0; y < h; y++) write(c, yardX0 - 2, y, '┊', { fg: '#444466' })
    world.yard = { x0: yardX0, x1: yardX1, y: rowY }
    // A one-pixel mattress in the far corner with a pillow, the bowl beside it.
    const bedX = yardX1 - BED_W
    write(c, bedX, rowY, '▄', { fg: '#ffffff' })
    write(c, bedX + 1, rowY, '▄'.repeat(BED_W - 1), { fg: '#9b5de5' })
    world.bed = { x: Math.max(yardX0, Math.min(yardX1 - body.w, bedX + Math.floor((BED_W - body.w) / 2))), platform: 'floor' }
    const bowlX = bedX - 4
    world.bowl = { x: bowlX - body.w, platform: 'floor' }
    write(c, bowlX, rowY, '╰─╯', { fg: '#00e5ff' })
  }
  return { canvas: c, world }
}

const BED_W = 6

/** The yard's ground when no scene paints one: a strip in the top half of the last row. */
export function drawFloor(c: Canvas, world: World): void {
  const yard = world.yard
  if (!yard) return
  for (let x = yard.x0; x <= yard.x1; x++) write(c, x, world.h - 1, '▀', { fg: '#5a3a1e' })
}

/** Draws the food in the bowl: one ∴ per portion above it. */
export function drawBowl(c: Canvas, world: World, portions: number): void {
  if (!world.bowl || !world.yard || portions <= 0) return
  const x = world.bowl.x + world.body.w
  write(c, x, world.yard.y - 1, '∴∴∴'.slice(0, Math.min(3, portions)), { fg: '#ffa640' })
}
