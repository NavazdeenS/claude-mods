import { describe, expect, test } from 'claude-code/testing'

import { blank, isBlank, paint, runs, write } from './canvas'
import { hash, rand } from './rand'

describe('canvas background', () => {
  test('writing over a painted cell keeps its background', async () => {
    const c = blank(3, 1)
    paint(c, 1, 0, '#112233')
    write(c, 0, 0, 'abc', { fg: '#ffffff' })
    expect(c.cells[0]?.[1]?.style).toEqual({ fg: '#ffffff', bg: '#112233' })
    expect(c.cells[0]?.[0]?.style.bg).toBeUndefined()
  })

  test('an explicit background wins over the painted one', async () => {
    const c = blank(1, 1)
    paint(c, 0, 0, '#112233')
    write(c, 0, 0, 'x', { bg: '#445566' })
    expect(c.cells[0]?.[0]?.style.bg).toBe('#445566')
  })

  test('paint keeps the character; runs split on background', async () => {
    const c = blank(4, 1)
    write(c, 0, 0, 'ab')
    paint(c, 1, 0, '#000001')
    expect(c.cells[0]?.[1]?.ch).toBe('b')
    expect(runs(c.cells[0] ?? []).map(r => r.text)).toEqual(['a', 'b', '  '])
    expect(isBlank(c, 2, 0)).toBe(true)
    expect(isBlank(c, 0, 0)).toBe(false)
    expect(isBlank(c, 9, 0)).toBe(false)
  })
})

describe('rand', () => {
  test('is deterministic and in [0, 1)', async () => {
    const [a, s] = rand(42)
    const [b] = rand(42)
    expect(a).toBe(b)
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThan(1)
    expect(rand(s)[0]).not.toBe(a)
    expect(hash(3, 4)).toBe(hash(3, 4))
    expect(hash(3, 4)).not.toBe(hash(4, 3))
  })
})
