import { describe, expect, test } from 'claude-code/testing'

import { localDay } from './care'
import { rowText } from './canvas'
import { type Bar, layout } from './layout'
import { RAINBOW, SCENES, WINDOW, type SceneInput, type SceneName, campfireX, paintScene, phase, sceneFor } from './scene'

const NOW = Date.parse('2026-10-13T12:00:00Z')
const DAY = 24 * 60 * 60_000
const BARS: Bar[] = [{ label: 'CONTEXT', percent: 52 }, { label: 'SESSION', percent: 30 }, { label: 'WEEKLY', percent: 75 }]
const fresh = () => layout('neo', BARS, 110, true)
const paint = (scene: SceneName, over: Partial<SceneInput> = {}) => {
  const { canvas, world } = fresh()
  paintScene(canvas, { world: world!, scene, hour: 12, frame: 0, now: NOW, weather: null, star: null, ...over })
  return { canvas, world: world!, yard: world!.yard! }
}
const yardColors = (r: ReturnType<typeof paint>) => {
  const out = new Set<string>()
  for (const row of r.canvas.cells) {
    for (const cell of row.slice(r.yard.x0, r.yard.x1 + 1)) {
      if (cell.style.fg) out.add(cell.style.fg)
      if (cell.style.bg) out.add(cell.style.bg)
    }
  }
  return out
}

test('phases change at 06, 17 and 19', async () => {
  expect([5.99, 6, 16.99, 17, 18.99, 19].map(phase)).toEqual(['night', 'day', 'day', 'sunset', 'sunset', 'night'])
})

test('the scene rotates by local day unless one is chosen', async () => {
  const week = [0, 1, 2, 3].map(d => sceneFor('auto', NOW + d * DAY))
  expect(new Set(week.slice(0, 3)).size).toBe(3)
  expect(week[3]).toBe(week[0])
  expect(sceneFor('city', NOW)).toBe('city')
  expect(sceneFor('off', NOW)).toBeNull()
  expect(localDay(NOW)).toBeDefined()
})

describe('paintScene', () => {
  test('every scene fills the whole yard with pixels and leaves the name and bars alone', async () => {
    for (const scene of SCENES) {
      for (const hour of [3, 12, 18]) {
        const { canvas, world: _w } = fresh()
        const bars = rowText(canvas, 9).slice(0, _w!.yard!.x0 - 2)
        const r = paint(scene, { hour })
        for (const row of r.canvas.cells) {
          for (const cell of row.slice(r.yard.x0, r.yard.x1 + 1)) expect(cell.style.bg !== undefined || cell.style.fg !== undefined).toBe(true)
        }
        expect(rowText(r.canvas, 9).slice(0, r.yard.x0 - 2)).toBe(bars)
        expect(r.canvas.cells[5]?.[0]?.style.bg).toBeUndefined()
      }
    }
  })

  test('platformer has bricks and green hills', async () => {
    const colors = yardColors(paint('platformer'))
    expect(colors.has('#c84c0c')).toBe(true)
    expect(colors.has('#00a800')).toBe(true)
  })

  test('city windows are lit only at night', async () => {
    expect(yardColors(paint('city', { hour: 23 })).has(WINDOW)).toBe(true)
    expect(yardColors(paint('city', { hour: 12 })).has(WINDOW)).toBe(false)
  })

  test('the campfire flickers from frame to frame', async () => {
    const at = (frame: number) => {
      const r = paint('camp', { hour: 23, frame })
      const x = campfireX(r.world)!
      return JSON.stringify(r.canvas.cells.map(row => row[x]))
    }
    expect(at(0)).not.toBe(at(1))
  })

  test('rain streaks fall in the yard; a rainbow arcs after', async () => {
    expect(yardColors(paint('platformer', { weather: { kind: 'rain', until: NOW + 1 } })).has('#8fa8ff')).toBe(true)
    expect(yardColors(paint('platformer', { weather: { kind: 'rain', until: NOW } })).has('#8fa8ff')).toBe(false)
    const bow = yardColors(paint('city', { weather: { kind: 'rainbow', until: NOW + 1 } }))
    expect(RAINBOW.every(c => bow.has(c))).toBe(true)
  })

  test('the band sky has stars at night and a shooting star when one flies', async () => {
    const r = paint('camp', { hour: 23, star: { x: 3, at: NOW - 300 } })
    const sky = rowText(r.canvas, 0) + rowText(r.canvas, 1)
    expect(sky).toContain('·')
    expect(sky).toContain('✦')
  })
})
