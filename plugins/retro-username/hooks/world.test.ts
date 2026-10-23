import { describe, expect, test } from 'claude-code/testing'

import { at, blank, rowText, runs, write } from './canvas'
import { type Bar, ROOMY_ROWS, layout } from './layout'
import { eat, feed, fresh, isHungry, settle } from './needs'

const BARS: Bar[] = [
  { label: 'CONTEXT', percent: 52, tail: '104k/200k' },
  { label: 'SESSION', percent: 30, tail: 'resets in 2h' },
  { label: 'WEEKLY', percent: 75, tail: 'resets in 2d 2h' },
]

describe('canvas', () => {
  test('writes clip to the grid and rows merge into styled runs', async () => {
    const c = blank(6, 1)
    write(c, -1, 0, 'abc', { fg: 'red' })
    write(c, 4, 0, 'xyz')
    expect(rowText(c, 0)).toBe('bc  xy')
    expect(runs(c.cells[0] ?? []).map(r => r.text)).toEqual(['bc', '  xy'])
    expect(at(c, 9, 0)).toBeUndefined()
  })
})

describe('layout', () => {
  test('roomy band has a perch above the name, a ledge above the bars and a yard', async () => {
    const { canvas, world } = layout('neo', BARS, 110, true)
    expect(canvas.h).toBe(ROOMY_ROWS)
    expect(world?.platforms.map(p => p.id)).toEqual(['perch', 'ledge', 'floor'])
    const ledge = world?.platforms.find(p => p.id === 'ledge')
    // The ledge is a pixel row: the girder is the bottom half of the next cell row down.
    const girderRow = ((ledge?.y ?? 0) + 1) >> 1
    expect(rowText(canvas, girderRow).slice(0, 12)).toMatch(/^▄+$/)
    expect(rowText(canvas, girderRow + 1).startsWith('CONTEXT')).toBe(true)
    const perch = world?.platforms.find(p => p.id === 'perch')
    expect((perch?.footholds ?? []).length).toBeGreaterThan(0)
    for (const x of perch?.footholds ?? []) {
      for (const f of world?.body.feet ?? []) expect(canvas.cells[((perch?.y ?? 0) + 1) >> 1]?.[x + f]?.ch).not.toBe(' ')
    }
    expect(rowText(canvas, girderRow - 1).trim()).toBe('┊')
    expect(world?.bed && world.bowl).toBeTruthy()
  })

  test('without room for a yard the pet keeps the perch and ledge', async () => {
    const { world } = layout('neo', BARS, 70, true)
    expect(world?.platforms.map(p => p.id)).toEqual(['perch', 'ledge'])
    expect(world?.yard).toBeUndefined()
    for (const p of world?.platforms ?? []) expect(p.x1 + (world?.body.w ?? 0)).toBeLessThan(71)
  })

  test('snug band is banner and bars with no world', async () => {
    const { canvas, world } = layout('neo', BARS, 110, false)
    expect(canvas.h).toBe(8)
    expect(world).toBeUndefined()
  })
})

describe('needs', () => {
  test('time makes the pet hungry; resting restores energy', async () => {
    const n = { ...fresh(0), energy: 10 }
    const later = settle(n, 6 * 60 * 60_000, true)
    expect(isHungry(later)).toBe(true)
    expect(later.energy).toBe(100)
    expect(settle(n, 60_000, false).energy).toBe(10)
  })

  test('feeding fills the bowl and eating empties it', async () => {
    const n = feed({ ...fresh(0), bowl: 0, hunger: 80 })
    expect(n.bowl).toBe(1)
    const fed = eat(n)
    expect(fed.bowl).toBe(0)
    expect(fed.hunger).toBe(35)
    expect(eat(fed)).toEqual(fed)
  })
})
