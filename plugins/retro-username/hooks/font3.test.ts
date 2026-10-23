import { describe, expect, test } from 'claude-code/testing'

import { GLYPHS, drawText, textWidth } from './font3'
import { surface } from './px'

const lit = (s: { col: Uint32Array }) => [...s.col].filter(c => c !== 0).length

describe('font3', () => {
  test('every character the band prints has a glyph', async () => {
    for (const ch of 'CONTEXT SESSION WEEKLY 0123456789 % / K M H D - . :') expect(GLYPHS[ch]).toBeDefined()
  })

  test('unknown letters draw blank but keep width', async () => {
    expect(textWidth('é')).toBe(3)
    expect(textWidth('')).toBe(0)
    const s = surface(10, 6)
    drawText(s, 0, 0, 'é', 0xffffff)
    expect(lit(s)).toBe(0)
  })

  test('scale doubles pixels and letters are upper-cased', async () => {
    const a = surface(20, 12)
    drawText(a, 0, 0, 'k', 0xffffff)
    const b = surface(20, 12)
    drawText(b, 0, 0, 'K', 0xffffff, { scale: 2 })
    expect(lit(a)).toBeGreaterThan(0)
    expect(lit(b)).toBe(lit(a) * 4)
    expect(textWidth('AB', 2)).toBe(14)
  })
})
