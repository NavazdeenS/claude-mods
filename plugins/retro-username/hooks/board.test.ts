import { describe, expect, test } from 'claude-code/testing'

import { BAR, BOARD_W, ROW, contextTail, drawBoard, meterColor } from './board'
import { surface } from './px'

const meters = (p?: number) => [
  { label: 'CONTEXT', percent: p, tail: p === undefined ? undefined : '84k/200k' },
  { label: 'SESSION', percent: 10, tail: '2h 10m' },
  { label: 'WEEKLY', percent: 10, tail: '4d 3h' },
]

/** Columns inside the first bar's frame holding the meter's colour (or its hatch shade). */
function filled(p: number | undefined): number {
  const s = surface(BOARD_W, 84)
  drawBoard(s, 0, BOARD_W, { name: 'neo', meters: meters(p) }, 1)
  let n = 0
  for (let x = BAR.x + 1; x < BAR.x + BAR.w; x++) {
    let hit = false
    for (let y = ROW.y; y < ROW.y + 5; y++) {
      const c = s.col[y * s.w + x] as number
      if (p !== undefined && (c === meterColor(p) || c === (meterColor(p) & 0xfefefe) >> 0 || isShade(c, meterColor(p)))) hit = true
    }
    if (hit) n++
  }
  return n
}
const isShade = (c: number, m: number) => {
  const k = (v: number, sh: number) => Math.round(((m >> sh) & 255) * 0.85) === ((c >> sh) & 255)
  return k(16, 16) && k(8, 8) && k(0, 0)
}

describe('board', () => {
  test('percent fill follows the meter', async () => {
    expect(filled(42)).toBe(Math.round((BAR.w - 2) * 0.42))
    expect(filled(100)).toBe(BAR.w - 2)
    expect(filled(0)).toBe(0)
  })

  test('colours change at 70 and 90', async () => {
    expect(meterColor(69)).toBe(0x78dc6e)
    expect(meterColor(70)).toBe(0xffaa46)
    expect(meterColor(89)).toBe(0xffaa46)
    expect(meterColor(90)).toBe(0xff465a)
  })

  test('missing readings chalk as dashes', async () => {
    const s = surface(BOARD_W, 84)
    drawBoard(s, 0, BOARD_W, { name: 'neo', meters: meters(undefined) }, 1)
    // the dash glyph's middle row, just past the bar
    const y = ROW.y + 2
    let chalk = 0
    for (let x = BAR.x + BAR.w + 4; x < BAR.x + BAR.w + 11; x++) if ((s.col[y * s.w + x] as number) > 0x808080) chalk++
    expect(chalk).toBeGreaterThan(2)
  })

  test('long and unknown-letter names fit the board', async () => {
    for (const name of ['navazdeen.shamsu@example', 'José', '']) {
      const s = surface(BOARD_W + 40, 84)
      drawBoard(s, 0, BOARD_W, { name, meters: meters(50) }, 2)
      for (let y = 0; y < 84; y++) for (let x = BOARD_W; x < s.w; x++) expect(s.col[y * s.w + x]).toBe(0)
    }
  })

  test('context tails fit the board without losing their meaning', async () => {
    expect(contextTail(84_000, 200_000)).toBe('84K/200K')
    expect(contextTail(142_000, 200_000)).toBe('142/200K')
    expect(contextTail(142_000, 1_000_000)).toBe('142K/1M')
    expect(contextTail(950_000, 1_000_000)).toBe('950K/1M')
    expect(contextTail(1_200_000, 2_000_000)).toBe('1.2M/2M')
    for (const [t, w] of [[1, 200_000], [199_999, 200_000], [999_999, 1_000_000], [1_999_999, 2_000_000]] as const) expect(contextTail(t, w).length).toBeLessThanOrEqual(8)
  })
})
