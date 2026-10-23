import { describe, expect, test } from 'claude-code/testing'

import { type Surface, copy, surface } from './px'
import { type Box, ROOM_W, drawRoomLive, drawRoomStatic, roomLayout, roomLights } from './room'

const NOW = Date.parse('2026-10-23T22:41:00')
const L = roomLayout(450, 84)

function at(t: number, weather: 'snow' | 'rain' = 'snow', now = NOW + t * 1000): Surface {
  const base = surface(450, 84)
  drawRoomStatic(base, L)
  const s = surface(450, 84)
  copy(s, base)
  drawRoomLive(s, L, t, { now, weather })
  return s
}

const differs = (a: Surface, b: Surface, box: Box) => {
  for (let y = box.y0; y <= box.y1; y++) for (let x = box.x0; x <= box.x1; x++) if (a.col[y * a.w + x] !== b.col[y * b.w + x]) return true
  return false
}

describe('room', () => {
  test('lays out against the right edge', async () => {
    expect(L.roomX).toBe(450 - ROOM_W)
    expect(L.floor).toBe(66)
    expect(L.deskTop).toBe(46)
  })

  test('static layer does not depend on time', async () => {
    const a = surface(450, 84)
    const b = surface(450, 84)
    drawRoomStatic(a, L)
    drawRoomStatic(b, L)
    expect(differs(a, b, { x0: 0, y0: 0, x1: 449, y1: 83 })).toBe(false)
  })

  test('live layer is deterministic', async () => {
    expect(differs(at(3.3), at(3.3), { x0: 0, y0: 0, x1: 449, y1: 83 })).toBe(false)
  })

  test('every listed element moves within six seconds', async () => {
    const names = L.alive.map(a => a.name)
    for (const n of ['stars', 'clouds', 'snow', 'pines', 'smoke', 'cabin', 'curtains', 'cat', 'candle', 'lights', 'clock', 'note', 'pothos', 'steam', 'motes', 'globe', 'jar', 'ivy', 'monstera', 'record']) {
      expect(names).toContain(n)
    }
    const t0 = at(0)
    const later = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6].map(t => at(t))
    for (const { name, box } of L.alive) {
      const moved = later.some(s => differs(t0, s, box))
      if (!moved) throw new Error(`${name} never moved`)
    }
  })

  test('rain draws streaks the snow does not', async () => {
    const win = L.alive.find(a => a.name === 'snow')?.box as Box
    expect(differs(at(2, 'snow'), at(2, 'rain'), win)).toBe(true)
  })

  test('clock shows local time', async () => {
    const clock = L.alive.find(a => a.name === 'clock')?.box as Box
    const three = at(1, 'snow', Date.parse('2026-10-23T03:00:00'))
    const nine = at(1, 'snow', Date.parse('2026-10-23T09:00:00'))
    expect(differs(three, nine, clock)).toBe(true)
  })

  test('room lights split into fixed and live', async () => {
    const { fixed, live } = roomLights(L, 1)
    expect(fixed.length).toBeGreaterThanOrEqual(2)
    expect(live.length).toBeGreaterThan(5)
    expect(live.every(l => l.r > 0 && l.k >= 0)).toBe(true)
  })

  test('sill items stay in front of the view', async () => {
    // the succulent's pot and the candle's wax sit on the sill, inside the window opening
    const s = at(4.2)
    const pot = s.col[49 * 450 + L.roomX + 64]
    expect(pot).toBe(0xc07048)
    const wax = s.col[48 * 450 + L.roomX + 77]
    expect(wax).toBe(0xece0c6)
  })
})
