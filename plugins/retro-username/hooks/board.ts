// The chalkboard on the room's left wall: the account name chalked large and
// underlined, then one row per meter (label, chalk-hatched bar, percent, tail),
// a chalk tray with chalk and an eraser, and dust drifting down.
import { drawText, textWidth } from './font3'
import { type Surface, line, rect, set } from './px'

export type BoardMeter = { label: string; percent?: number; tail?: string }
export type BoardData = { name: string; meters: readonly BoardMeter[] }

export const BOARD_W = 159
/** The first meter row's top and the bar's left edge and width, from the board's left edge. */
export const ROW = { y: 32, dy: 8 }
export const BAR = { x: 42, w: 52 }

/** A context tail of at most eight characters: tokens over the window, the unit dropped from the tokens first, then the window. */
export function contextTail(tokens: number, window: number): string {
  const unit = (n: number) => (n >= 1_000_000 ? 'M' : 'K')
  const num = (n: number) => (n >= 1_000_000 ? `${Math.round(n / 100_000) / 10}` : `${Math.round(n / 1000)}`)
  const k = (n: number) => `${num(n)}${unit(n)}`
  const full = `${k(tokens)}/${k(window)}`
  if (full.length <= 8) return full
  const short = `${num(tokens)}/${k(window)}`
  if (unit(tokens) === unit(window) && short.length <= 8) return short
  return k(tokens)
}

export const meterColor = (percent: number): number => (percent >= 90 ? 0xff465a : percent >= 70 ? 0xffaa46 : 0x78dc6e)
const shade = (c: number, k: number) =>
  (Math.round(((c >> 16) & 255) * k) << 16) | (Math.round(((c >> 8) & 255) * k) << 8) | Math.round((c & 255) * k)

export function drawBoard(s: Surface, x0: number, w: number, d: BoardData, t: number): void {
  drawBoardFace(s, x0, w, d)
  drawChalkDust(s, x0, w, t)
}

/** Everything on the board but the drifting dust: drawn again only when the numbers change. */
export function drawBoardFace(s: Surface, x0: number, w: number, d: BoardData): void {
  const fx0 = x0 + 8, fx1 = x0 + w - 10, y0 = 11, y1 = 59
  rect(s, fx0, y0, fx1, y1, 0x5a361f)
  rect(s, fx0, y0, fx1, y0, 0xb07a4c)
  rect(s, fx0, y0 + 1, fx1, y0 + 2, 0x93603a)
  rect(s, fx1 - 1, y0, fx1, y1, 0x3e2415)
  rect(s, fx0 + 3, y0 + 3, fx1 - 3, y1 - 3, 0x1f3328)
  for (let i = 0; i < 260; i++) set(s, fx0 + 3 + ((i * 7919) % (fx1 - fx0 - 6)), y0 + 3 + ((i * 104729) % (y1 - y0 - 6)), i % 3 ? 0x243a2e : 0x2a4234)

  // The name: big when it fits, small otherwise, cut to the board's width last.
  const room = fx1 - fx0 - 14
  let name = d.name.toUpperCase()
  const scale = textWidth(name, 2) <= room ? 2 : 1
  while (name.length > 0 && textWidth(name, scale) > room) name = name.slice(0, -1)
  const nw = textWidth(name, scale)
  const nx = Math.round((fx0 + fx1 - nw) / 2), ny = scale === 2 ? y0 + 5 : y0 + 8
  drawText(s, nx, ny, name, 0xf0f0e6, { scale, rough: 9 })
  if (nw > 0) line(s, nx, y0 + 17, nx + nw, y0 + 17, 0xd8d8cc)

  d.meters.slice(0, 3).forEach((m, i) => {
    const y = ROW.y + i * ROW.dy, bx = x0 + BAR.x, bw = BAR.w
    drawText(s, fx0 + 6, y, m.label.slice(0, 7), 0xd8e0d0, { rough: 11 })
    rect(s, bx, y - 1, bx + bw, y - 1, 0x8a9a88)
    rect(s, bx, y + 5, bx + bw, y + 5, 0x8a9a88)
    rect(s, bx, y - 1, bx, y + 5, 0x8a9a88)
    rect(s, bx + bw, y - 1, bx + bw, y + 5, 0x8a9a88)
    if (m.percent === undefined) {
      drawText(s, bx + bw + 4, y, '--', 0xd8e0d0)
    } else {
      const p = Math.max(0, Math.min(100, m.percent)), mc = meterColor(p)
      const fill = Math.round(((bw - 2) * p) / 100)
      for (let q = 0; q < fill; q++) for (let r = 0; r < 5; r++) if ((q + r) % 3 !== 0 || q === fill - 1) set(s, bx + 1 + q, y + r, (q + r) % 3 === 1 ? shade(mc, 0.85) : mc)
      drawText(s, bx + bw + 4, y, `${Math.round(m.percent)}%`, mc)
    }
    if (m.tail) {
      const tx = bx + bw + 20, fit = Math.max(0, Math.floor((fx1 - 3 - tx + 1) / 4))
      drawText(s, tx, y, m.tail.toUpperCase().slice(0, fit), 0xa8b4a4, { rough: 13 })
    }
  })

  // Chalk tray with two sticks and a felt eraser.
  rect(s, fx0 + 2, y1 + 1, fx1 - 2, y1 + 2, 0x93603a)
  rect(s, fx0 + 2, y1 + 3, fx1 - 2, y1 + 3, 0x3e2415)
  rect(s, fx0 + 18, y1, fx0 + 23, y1, 0xf4f4ec)
  rect(s, fx0 + 28, y1, fx0 + 31, y1, 0xf0b0c0)
  rect(s, fx1 - 26, y1 - 2, fx1 - 14, y1, 0x5a4a8a)
  rect(s, fx1 - 26, y1 - 2, fx1 - 14, y1 - 2, 0x7a6aaa)
}

export function drawChalkDust(s: Surface, x0: number, w: number, t: number): void {
  const fx0 = x0 + 8, fx1 = x0 + w - 10, y1 = 59
  for (let i = 0; i < 10; i++) {
    const ph = (t * 0.05 + i / 10) % 1
    set(s, fx0 + 12 + ((i * 37) % (fx1 - fx0 - 24)) + Math.round(Math.sin(t + i) * 2), y1 - 2 - ph * 30, 0x9aa89a)
  }
}
