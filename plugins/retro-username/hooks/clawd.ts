// Claude at the desk, seen from behind: the clay body on a chair, legs
// swinging, the laptop screen facing the room. What the screen shows and how
// Claude sits follow the mood; now and then it peeks back over its shoulder.
import type { Mood } from '../types'
import type { Light } from './light'
import { type Surface, rect, set } from './px'
import { type RoomLayout, hash } from './room'

export type ClawdLook = { mood: Mood; tool?: string }

/** The clay ramp, dark outline to highlight. */
export const RAMP: readonly number[] = [0x4e1c10, 0x6e2c1a, 0x8c3a22, 0xa84a2e, 0xc05a3a, 0xd46c4c, 0xdf8162, 0xea987c, 0xf4b49a, 0xfbd0bc]
const EYE = 0x1c0e0a, EYE_HI = 0x8a6a60
const tone = (i: number) => RAMP[Math.max(0, Math.min(RAMP.length - 1, i))] as number

/** The laptop screen's glass, in room x and relative to the desk top. */
export const SCREEN = { x: 160, dy: -15, w: 24, h: 13 }
const LAPTOP = 158, CHAIR = 130
const CODE = [0xf07a9a, 0x8ad0ff, 0xb8e08a, 0xe8e4d8, 0xf0c070, 0x9a90c8]

const osc = (t: number, period: number, phase = 0) => Math.sin((t / period + phase) * Math.PI * 2)

/** The clay body: lighter at the top, rim light on the top and lamp side, outline on the unlit sides, a little clay grain. */
function body(s: Surface, x0: number, y0: number, w: number, h: number): void {
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && !(y === 0 && (x === 0 || x === w - 1))
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue
      const edgeL = !inside(x - 1, y), edgeR = !inside(x + 1, y), edgeT = !inside(x, y - 1), edgeB = !inside(x, y + 1)
      let v = 5.6 - (y / (h - 1)) * 2.2 + (x / (w - 1) - 0.5) * 1.2
      if ((((x * 73856093) ^ (y * 19349663)) >>> 0) % 7 === 0) v -= 0.8
      let c = Math.max(1, Math.min(8, Math.round(v)))
      if (edgeT) c = Math.min(9, c + 2)
      if (edgeR && !edgeB) c = Math.min(9, c + 1)
      if (edgeL || edgeB) c = edgeT ? 4 : 0
      set(s, x0 + x, y0 + y, tone(c))
    }
  }
}

function arm(s: Surface, x: number, y: number, dir: number, lifted: boolean): void {
  const rows = lifted ? ['.hhh', 'cccc', 'oss.'] : ['hhh.', 'cccc', '.sso']
  const pal: Record<string, number> = { h: tone(7), c: tone(5), s: tone(3), o: tone(0) }
  rows.forEach((r, j) => {
    for (let i = 0; i < 4; i++) {
      const c = pal[r[i] as string]
      if (c !== undefined) set(s, x + (dir > 0 ? i : 3 - i), y + j, c)
    }
  })
}

/** Draws the laptop, the chair and Claude; returns the screen's light. */
export function drawDeskClawd(s: Surface, L: RoomLayout, t: number, look: ClawdLook): Light[] {
  const dTop = L.deskTop, FL = L.floor
  const { mood } = look
  const isWorking = mood === 'working', isAsleep = mood === 'sleeping', isError = mood === 'error'
  const isBash = isWorking && look.tool === 'Bash'
  s.ox = L.roomX

  // Laptop facing the room.
  const ly = dTop - 17
  rect(s, LAPTOP, ly, LAPTOP + 27, ly + 16, 0x2a2a34)
  rect(s, LAPTOP + 1, ly + 1, LAPTOP + 26, ly + 15, 0x3a3a46)
  const sx0 = SCREEN.x, sy0 = dTop + SCREEN.dy
  rect(s, sx0, sy0, sx0 + SCREEN.w - 1, sy0 + SCREEN.h - 1, isBash ? 0x0a140a : isError ? 0x3a1418 : 0x141a26, true)
  if (!isAsleep) {
    const scroll = isWorking ? Math.floor(t * 2.2) : 0
    for (let r = 0; r < 6; r++) {
      const ln = scroll + r, y = sy0 + 1 + r * 2
      let x = sx0 + 2 + (hash(ln, 3) % 3) * 2
      const words = isBash ? 1 + (hash(ln, 4) % 2) : 1 + (hash(ln, 4) % 4)
      for (let w = 0; w < words && x < sx0 + SCREEN.w - 2; w++) {
        const len = 2 + (hash(ln, w + 5) % 5)
        const c = isBash ? (w === 0 ? 0x6ae06a : 0xc8e8c8) : isError ? 0xf07a7a : (CODE[hash(ln, w + 9) % CODE.length] as number)
        rect(s, x, y, Math.min(sx0 + SCREEN.w - 2, x + len - 1), y, c, true)
        x += len + 1
      }
      if (r === 5 && Math.floor(t * 2) % 2 === 0) rect(s, x, y, x, y + 1, 0xffffff, true)
    }
  }
  rect(s, LAPTOP - 2, dTop - 1, LAPTOP + 29, dTop - 1, 0x70707e)

  // Chair seat and legs.
  const seat = dTop + 3
  rect(s, CHAIR, seat, CHAIR + 26, seat + 1, 0x93603a)
  rect(s, CHAIR, seat + 2, CHAIR + 26, seat + 2, 0x3e2415)
  for (const lx of [CHAIR + 1, CHAIR + 24]) rect(s, lx, seat + 3, lx + 1, FL + 6, 0x5a361f)

  // Claude from behind.
  const breathe = osc(t, 3.6) > 0.2
  const w = 22, h = 17, x0 = CHAIR + 2
  const top = seat - h + (breathe ? 0 : 1) + (isAsleep ? 1 : 0)
  for (let i = 0; i < 4; i++) {
    const sw = isAsleep ? 0 : Math.round(Math.sin(t * 3 + i * 1.3) * 1.2)
    rect(s, x0 + 3 + i * 5 + sw, seat + 3, x0 + 4 + i * 5 + sw, seat + 6, tone(i % 2 ? 2 : 3))
  }
  body(s, x0, top, w, h)
  // The screen's light along the top edge and the right side.
  if (!isAsleep) {
    for (let x = 1; x < w - 1; x++) set(s, x0 + x, top, x % 2 ? 0xa8c8f0 : 0xd8b8b0)
    for (let y = 1; y < h - 3; y++) set(s, x0 + w - 1, top + y, 0x9ab0d8)
  }
  const typing = isWorking && Math.floor(t * 7) % 2 === 1
  if (isAsleep) {
    arm(s, x0 - 3, top + 10, -1, false)
    arm(s, x0 + w - 1, top + 10, 1, false)
    for (let i = 0; i < 2; i++) {
      const ph = (t * 0.5 + i / 2) % 1
      const zx = x0 + w - 2 + Math.round(ph * 6), zy = top - 3 - Math.round(ph * 9)
      for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [1, 1], [0, 2], [1, 2], [2, 2]] as const) set(s, zx + dx, zy + dy, 0x8888ff, true)
    }
  } else {
    arm(s, x0 - 3, top + 8 + (typing ? 0 : 1), -1, typing)
    arm(s, x0 + w - 1, top + 8 + (typing ? 1 : 0), 1, !typing)
  }
  if (mood === 'thinking') for (let i = 0; i < 3; i++) if (Math.floor(t * 3) % 4 > i) rect(s, x0 + 7 + i * 4, top - 4, x0 + 8 + i * 4, top - 3, 0xffffff, true)
  // A peek over the shoulder now and then.
  const blink = t % 4.3 < 0.12
  if (!isAsleep && t % 12 > 9.5 && !blink) {
    rect(s, x0 + 1, top + 5, x0 + 2, top + 8, EYE)
    set(s, x0 + 1, top + 5, EYE_HI)
  }
  // The chair's back rail in front of Claude's lower body.
  for (const bx of [CHAIR + 3, CHAIR + 12, CHAIR + 21]) rect(s, bx, seat - 3, bx + 2, seat - 1, 0x764a2c)
  rect(s, CHAIR + 1, seat - 5, CHAIR + 25, seat - 4, 0x93603a)
  rect(s, CHAIR + 1, seat - 5, CHAIR + 25, seat - 5, 0xb07a4c)
  s.ox = 0

  const tint: readonly [number, number, number] = isBash ? [120, 230, 140] : isError ? [255, 110, 110] : [130, 190, 255]
  const k = isAsleep ? 0.25 : 0.7 * (0.85 + 0.15 * osc(t, 2.5))
  return [{ x: L.roomX + LAPTOP + 13, y: ly + 10, r: 34, k, tint }]
}
