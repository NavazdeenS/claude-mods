import { describe, expect, test } from 'claude-code/testing'

import { copy, hx, set, spr, surface } from './px'

describe('px', () => {
  test('set clips outside and honours ox', async () => {
    const s = surface(4, 2)
    set(s, -1, 0, 0xff0000)
    set(s, 4, 0, 0xff0000)
    set(s, 0, 2, 0xff0000)
    expect([...s.col].every(c => c === 0)).toBe(true)
    const t = surface(8, 1)
    t.ox = 5
    set(t, 0, 0, 0x123456)
    expect(t.col[5]).toBe(0x123456)
  })

  test('spr maps palette and marks lit chars', async () => {
    const s = surface(2, 1)
    spr(s, 0, 0, ['ab'], { a: 1, b: 2 }, 'b')
    expect(s.col[0]).toBe(1)
    expect(s.emit[0]).toBe(0)
    expect(s.col[1]).toBe(2)
    expect(s.emit[1]).toBe(1)
  })

  test('copy duplicates colour and emit', async () => {
    const a = surface(2, 1)
    set(a, 1, 0, hx('#0a0b0c'), true)
    const b = surface(2, 1)
    copy(b, a)
    expect(b.col[1]).toBe(0x0a0b0c)
    expect(b.emit[1]).toBe(1)
  })
})
