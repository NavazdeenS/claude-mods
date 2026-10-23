import { describe, expect, test } from 'claude-code/testing'

import { type ClawdLook, SCREEN, drawDeskClawd } from './clawd'
import { type Surface, surface } from './px'
import { roomLayout } from './room'

const L = roomLayout(450, 84)

function draw(t: number, look: ClawdLook): Surface {
  const s = surface(450, 84)
  drawDeskClawd(s, L, t, look)
  return s
}
const screenBox = () => ({ x0: L.roomX + SCREEN.x, y0: L.deskTop + SCREEN.dy, x1: L.roomX + SCREEN.x + SCREEN.w - 1, y1: L.deskTop + SCREEN.dy + SCREEN.h - 1 })
function region(s: Surface, b: { x0: number; y0: number; x1: number; y1: number }): number[] {
  const out: number[] = []
  for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) out.push(s.col[y * s.w + x] as number)
  return out
}

describe('clawd', () => {
  test('screen code scrolls only while working', async () => {
    const work: ClawdLook = { mood: 'working', tool: 'Edit' }
    expect(region(draw(0, work), screenBox())).not.toEqual(region(draw(1, work), screenBox()))
    const idle: ClawdLook = { mood: 'idle' }
    expect(region(draw(0, idle), screenBox())).toEqual(region(draw(1, idle), screenBox()))
  })

  test('bash shows a terminal', async () => {
    expect(region(draw(2, { mood: 'working', tool: 'Bash' }), screenBox())).toContain(0x6ae06a)
    expect(region(draw(2, { mood: 'working', tool: 'Edit' }), screenBox())).not.toContain(0x6ae06a)
  })

  test('Claude stays at the desk', async () => {
    for (const mood of ['working', 'thinking', 'idle', 'sleeping', 'error', 'happy'] as const) {
      for (const t of [0, 1.3, 4.7, 9.9]) {
        const s = draw(t, { mood, tool: 'Edit' })
        for (let y = 0; y < 84; y++) {
          for (let x = 0; x < 450; x++) {
            if (s.col[y * 450 + x] === 0) continue
            expect(x >= L.roomX + 120 && x <= L.roomX + 190).toBe(true)
            expect(y >= L.deskTop - 30 && y <= L.floor + 6).toBe(true)
          }
        }
      }
    }
  })

  test('asleep shows z, awake does not', async () => {
    const z = (s: Surface) => region(s, { x0: L.roomX + 120, y0: L.deskTop - 30, x1: L.roomX + 190, y1: L.deskTop - 10 }).includes(0x8888ff)
    expect([0, 0.5, 1, 1.5].some(t => z(draw(t, { mood: 'sleeping' })))).toBe(true)
    expect([0, 0.5, 1, 1.5].some(t => z(draw(t, { mood: 'idle' })))).toBe(false)
  })

  test('the screen lights the room', async () => {
    const lights = drawDeskClawd(surface(450, 84), L, 1, { mood: 'working', tool: 'Edit' })
    expect(lights.length).toBe(1)
    expect(lights[0]?.r).toBeGreaterThan(20)
  })
})
