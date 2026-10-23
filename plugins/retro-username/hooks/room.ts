// The cozy room at night: a static layer drawn once per size (wall, floor,
// furniture) and a live layer drawn every frame (everything that moves).
// Coordinates inside the room are relative to `roomX`; the wall, floor and
// string lights span the whole band. Motion is a pure function of `t` (seconds).
import type { Light } from './light'
import { type Surface, disc, hx, line, rect, set, spr } from './px'

export const ROOM_W = 291
export type RoomEnv = { now: number; weather: 'snow' | 'rain' }
export type Box = { x0: number; y0: number; x1: number; y1: number }
export type RoomLayout = {
  w: number
  h: number
  roomX: number
  floor: number
  deskTop: number
  alive: { name: string; box: Box }[]
  /** Where the window shows open sky (1), the moon (2) or mountains (0). */
  skyMask: Uint8Array
}

const TAU = Math.PI * 2
export const hash = (x: number, y: number, z = 0): number => {
  let h = (x * 374761393 + y * 668265263 + z * 1442695041) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return (h ^ (h >>> 16)) >>> 0
}
export const rnd = (x: number, y: number, z = 0): number => hash(x, y, z) / 4294967296
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16)
const bayer = (x: number, y: number) => BAYER[(y & 3) * 4 + (x & 3)] as number
const ramp = (...hs: string[]) => hs.map(hx)
const at = (r: readonly number[], i: number) => r[Math.max(0, Math.min(r.length - 1, i))] as number

export const C = {
  wall: ramp('#1e120d', '#28180f', '#311e14', '#3b2519', '#462d1f'),
  wood: ramp('#2a170d', '#3e2415', '#5a361f', '#764a2c', '#93603a', '#b07a4c'),
  floor: ramp('#2e1a0f', '#4a2c19', '#5e3920', '#704628', '#845533'),
  sky: ramp('#0b0d24', '#11143a', '#181d4e', '#212862', '#2d3474', '#3c4184', '#4e4c8e'),
  mtn: ramp('#1c2244', '#232a52', '#2c3360'),
  pine: ramp('#0c1424', '#111b30', '#16233a'),
  cur: ramp('#3e2a52', '#55396c', '#6c4c86', '#8562a0', '#9c7cb8'),
  leaf: ramp('#16301c', '#22462a', '#2f5e34', '#3f7a3e', '#57984a', '#78b85c'),
  mug: ramp('#8e8270', '#b8ac96', '#d8ccb4', '#f2e8d4'),
  cat: ramp('#3a3236', '#5a5056', '#7a7076', '#9a9096', '#c0b6ba'),
  rug: ramp('#4a1a1e', '#6e2428', '#8a3030', '#a23e38', '#c8a050', '#e0c070'),
  brass: ramp('#6a4a1a', '#9a7030', '#c8a048', '#ecd078'),
}
const BOOKS = [
  ramp('#4a1414', '#6e2020', '#943030', '#b84a3e'), ramp('#14284a', '#1e3c66', '#2e5682', '#4672a0'), ramp('#4a3a12', '#6e581e', '#967a30', '#c4a048'),
  ramp('#163a1e', '#22522a', '#346c3a', '#4c8a4a'), ramp('#34184a', '#4a2466', '#663a86', '#8456a6'), ramp('#4a3e30', '#6e5e4a', '#9a8668', '#c8b494'),
  ramp('#123a3a', '#1c5252', '#2a6e6a', '#428e86'),
]
const BULB_HUES: readonly (readonly [number, number, number])[] = [[255, 214, 120], [255, 160, 90], [255, 120, 110], [150, 220, 160], [140, 190, 255]]

// Fixed places inside the room (room coordinates).
const WIN = { x: 16, y: 12, w: 70, h: 40 }
const SILL = WIN.y + WIN.h + 1
const CABIN = { x: WIN.x + 44, y: WIN.y + WIN.h - 9 }
const CAT = { x: WIN.x + 4, y: SILL - 11 }
const CANDLE = { x: WIN.x + WIN.w - 10, y: SILL - 1 }
const PAINT = { x: 103, y: 11 }
const CLOCK = { x: 178, y: 20 }
const CORK = 198
const POTHOS = { x: 92, y: 8 }
const DESK = { x0: 104, x1: 212 }
const MUG = 108
const LAMP = 206
const SHELF = { x0: 226, x1: 262, top: 8 }
const MONSTERA = 282
const RECORD = { x: 1 }

const osc = (t: number, period: number, phase = 0) => Math.sin((t / period + phase) * TAU)
const MOON = { x: 52, y: 9 }
const range1 = (x: number) => 16 + Math.round(6 * Math.abs(Math.sin((x + 10) / 14)) + 2 * Math.sin(x / 5))
const range2 = (x: number) => 10 + Math.round(3 * Math.sin((x + 3) / 9) + 1.5 * Math.sin(x / 3.3))

/** Per window pixel: 0 mountain, 1 open sky, 2 the moon and its halo. */
function skyMask(): Uint8Array {
  const m = new Uint8Array(WIN.w * WIN.h)
  for (let x = 0; x < WIN.w; x++) {
    const top = WIN.h - Math.max(range1(x), range2(x))
    for (let y = 0; y < top; y++) {
      const dx = x - MOON.x, dy = y - MOON.y
      m[y * WIN.w + x] = dx * dx + dy * dy <= 81 + 9 * 0.6 ? 2 : 1
    }
  }
  return m
}

export function roomLayout(w: number, h: number): RoomLayout {
  const roomX = w - ROOM_W
  const floor = h - 18
  const deskTop = floor - 20
  const R = roomX
  const box = (x0: number, y0: number, x1: number, y1: number): Box => ({ x0: Math.max(0, R + x0), y0: Math.max(0, y0), x1: Math.min(w - 1, R + x1), y1: Math.min(h - 1, y1) })
  const plan = shelfPlan(floor)
  const globe = plan.find(p => p.kind === 'globe')
  const jar = plan.find(p => p.kind === 'jar')
  const rpy = floor + 4
  const alive: { name: string; box: Box }[] = [
    { name: 'stars', box: box(WIN.x, WIN.y, WIN.x + WIN.w - 1, WIN.y + WIN.h - 17) },
    { name: 'clouds', box: box(WIN.x, WIN.y, WIN.x + WIN.w - 1, WIN.y + 22) },
    { name: 'snow', box: box(WIN.x, WIN.y, WIN.x + WIN.w - 1, WIN.y + WIN.h - 1) },
    { name: 'pines', box: box(WIN.x, WIN.y + WIN.h - 25, WIN.x + WIN.w - 1, WIN.y + WIN.h - 1) },
    { name: 'smoke', box: box(CABIN.x + 5, CABIN.y - 24, CABIN.x + 16, CABIN.y - 6) },
    { name: 'cabin', box: box(CABIN.x + 2, CABIN.y + 2, CABIN.x + 3, CABIN.y + 3) },
    { name: 'curtains', box: box(WIN.x - 15, WIN.y - 6, WIN.x + 2, SILL + 5) },
    { name: 'cat', box: box(CAT.x, CAT.y - 1, CAT.x + 24, CAT.y + 15) },
    { name: 'candle', box: box(CANDLE.x - 1, CANDLE.y - 15, CANDLE.x + 4, CANDLE.y - 9) },
    { name: 'lights', box: { x0: 0, y0: 2, x1: w - 1, y1: 16 } },
    { name: 'clock', box: box(CLOCK.x - 5, CLOCK.y - 5, CLOCK.x + 5, CLOCK.y + 5) },
    { name: 'note', box: box(CORK + 16, 24, CORK + 23, 30) },
    { name: 'pothos', box: box(POTHOS.x - 9, POTHOS.y + 3, POTHOS.x + 9, POTHOS.y + 36) },
    { name: 'steam', box: box(MUG, deskTop - 28, MUG + 10, deskTop - 9) },
    { name: 'motes', box: box(LAMP - 34, deskTop - 24, LAMP + 4, deskTop - 1) },
    { name: 'globe', box: globe ? box(globe.x, globe.y - 12, globe.x + 9, globe.y) : box(0, 0, 0, 0) },
    { name: 'jar', box: jar ? box(jar.x, jar.y - 11, jar.x + 7, jar.y) : box(0, 0, 0, 0) },
    { name: 'ivy', box: box(SHELF.x0 - 4, SHELF.top - 4, SHELF.x0 + 10, SHELF.top + 32) },
    { name: 'monstera', box: box(MONSTERA - 30, floor - 60, MONSTERA + 8, floor - 12) },
    { name: 'record', box: box(RECORD.x, rpy - 40, RECORD.x + 28, rpy - 12) },
  ]
  return { w, h, roomX, floor, deskTop, alive, skyMask: skyMask() }
}

type ShelfItem = { kind: 'book' | 'globe' | 'jar'; x: number; y: number; si: number; h: number }

/** Where each book, the globe and the fairy jar stand, shelf by shelf. */
function shelfPlan(floor: number): ShelfItem[] {
  const bb = floor - 1
  const shelves = [SHELF.top + 16, SHELF.top + 30, SHELF.top + 44, bb]
  const out: ShelfItem[] = []
  shelves.forEach((sy, si) => {
    let x = SHELF.x0 + 2
    while (x < SHELF.x1 - 2) {
      const h = hash(x, sy, 7)
      if (si === 0 && x > SHELF.x0 + 20 && x < SHELF.x0 + 24) {
        out.push({ kind: 'globe', x, y: sy, si, h })
        x += 10
        continue
      }
      if (si === 2 && x > SHELF.x0 + 4 && x < SHELF.x0 + 8) {
        out.push({ kind: 'jar', x, y: sy, si, h })
        x += 9
        continue
      }
      out.push({ kind: 'book', x, y: sy, si, h })
      const bw = 2 + ((h >>> 5) % 3)
      const lean = (h >>> 13) % 9 === 0 && x + bw + 3 < SHELF.x1 - 2
      x += bw + (lean ? 3 : 0) + ((h >>> 17) % 6 === 0 ? 1 : 0)
    }
  })
  return out
}

/** The string-light bulbs at time `t` (band coordinates). */
function bulbs(w: number, t: number): { x: number; y: number; id: number; on: boolean; tw: number }[] {
  const nails: number[] = []
  for (let n = 0; n < w; n += 46) nails.push(n)
  nails.push(w - 1)
  const out: { x: number; y: number; id: number; on: boolean; tw: number }[] = []
  for (let n = 0; n < nails.length - 1; n++) {
    const a = nails[n] as number, b = nails[n + 1] as number, sag = 5 + osc(t, 4, n * 0.2) * 0.8
    for (let x = a + 4; x <= b; x += 9) {
      const u = (x - a) / (b - a), y = 3 + Math.round(4 * sag * u * (1 - u))
      const id = Math.floor(x / 9)
      const tw = 0.7 + 0.3 * Math.sin((t * (0.8 + rnd(id, 2) * 1.5) + rnd(id, 3)) * TAU)
      out.push({ x, y, id, on: !(id % 13 === 5 && t % 7 < 0.4), tw })
    }
  }
  return out
}

export function drawRoomStatic(s: Surface, L: RoomLayout): void {
  const { w, h, floor: FL } = L
  s.ox = 0
  // Wall: vertical planks with seams, grain and knots.
  for (let x = 0; x < w; x++) {
    const p = Math.floor(x / 9), u = x % 9, base = 1 + (hash(p, 1) % 3)
    for (let y = 0; y < FL; y++) {
      let v = u === 0 ? 0 : u === 1 ? Math.min(4, base + 1) : u === 8 ? Math.max(0, base - 1) : base
      if (u > 1 && u < 8 && (y + (hash(p, 2) % 7)) % 11 === 0 && rnd(x, y, 3) < 0.6) v = Math.max(0, v - 1)
      set(s, x, y, at(C.wall, v))
    }
    if (u === 4 && hash(p, 5) % 3 === 0) {
      const ky = 6 + (hash(p, 6) % (FL - 20))
      disc(s, x, ky, 1, at(C.wall, 0))
      set(s, x, ky - 1, at(C.wall, 4))
    }
  }
  // Wainscot, chair rail and baseboard.
  const rail = FL - 15
  for (let x = 0; x < w; x++) {
    set(s, x, rail, at(C.wood, 4))
    set(s, x, rail + 1, at(C.wood, 3))
    set(s, x, rail + 2, at(C.wood, 1))
    for (let y = rail + 3; y < FL - 3; y++) set(s, x, y, x % 18 === 0 || x % 18 === 17 ? at(C.wood, 1) : x % 18 === 1 ? at(C.wood, 3) : at(C.wood, 2))
    set(s, x, FL - 3, at(C.wood, 4))
    set(s, x, FL - 2, at(C.wood, 2))
    set(s, x, FL - 1, at(C.wood, 0))
  }
  // Floor: staggered planks.
  for (let y = FL; y < h; y++) {
    const row = Math.floor((y - FL) / 4), v = (y - FL) % 4
    for (let x = 0; x < w; x++) {
      const off = (row * 23) % 37, plank = Math.floor((x + off) / 37), joint = (x + off) % 37 === 0
      let c = v === 3 ? 0 : 1 + (hash(row, plank) % 3) + (v === 0 ? 1 : 0)
      if (joint) c = 0
      if (v === 1 && rnd(x, y) < 0.04) c = Math.max(0, c - 1)
      set(s, x, y, at(C.floor, c))
    }
  }

  s.ox = L.roomX
  // The view: night sky, the moon with its halo, two mountain ranges (stars, clouds and the rest are live).
  const { x: wx, y: wy, w: ww, h: wh } = WIN
  for (let y = 0; y < wh; y++) {
    const g = (y / wh) * (C.sky.length - 1), i = Math.floor(g)
    for (let x = 0; x < ww; x++) set(s, wx + x, wy + y, at(C.sky, i + (g - i > bayer(x, y) ? 1 : 0)), true)
  }
  const halo = [0x2a2f6a, 0x323874, 0x3c4280, 0x474c8a]
  for (let r = 9; r >= 6; r--) disc(s, wx + MOON.x, wy + MOON.y, r, halo[9 - r] as number, true)
  disc(s, wx + MOON.x, wy + MOON.y, 5, 0xf4e8b8, true)
  disc(s, wx + MOON.x + 1, wy + MOON.y - 1, 4, 0xfff4cc, true)
  for (const [dx, dy, r] of [[-2, 1, 1], [2, 2, 0], [1, -2, 0], [-1, -3, 0]] as const) disc(s, wx + MOON.x + dx, wy + MOON.y + dy, r, 0xd8c890, true)
  for (let x = 0; x < ww; x++) {
    const h1 = range1(x)
    for (let y = wh - h1; y < wh; y++) set(s, wx + x, wy + y, y < wh - h1 + 2 && h1 > 20 ? 0x7c80b0 : at(C.mtn, y < wh - h1 + 5 ? 2 : 1), true)
    for (let y = wh - range2(x); y < wh; y++) set(s, wx + x, wy + y, at(C.mtn, 0), true)
  }

  // Window frame and sill.
  for (let x = wx - 3; x < wx + ww + 3; x++) {
    set(s, x, wy - 3, at(C.wood, 2))
    set(s, x, wy - 2, at(C.wood, 4))
    set(s, x, wy - 1, at(C.wood, 3))
  }
  for (let y = wy - 3; y < wy + wh + 1; y++) {
    set(s, wx - 3, y, at(C.wood, 2))
    set(s, wx - 2, y, at(C.wood, 4))
    set(s, wx - 1, y, at(C.wood, 3))
    set(s, wx + ww, y, at(C.wood, 2))
    set(s, wx + ww + 1, y, at(C.wood, 1))
    set(s, wx + ww + 2, y, at(C.wood, 0))
  }
  for (let x = wx - 7; x < wx + ww + 7; x++) {
    set(s, x, SILL, at(C.wood, 5))
    set(s, x, SILL + 1, at(C.wood, 4))
    set(s, x, SILL + 2, at(C.wood, 2))
    set(s, x, SILL + 3, at(C.wood, 0))
  }
  // Curtain rod and its rings.
  line(s, wx - 12, wy - 7, wx + ww + 11, wy - 7, at(C.brass, 1))
  line(s, wx - 12, wy - 8, wx + ww + 11, wy - 8, at(C.brass, 2))
  disc(s, wx - 13, wy - 7, 1, at(C.brass, 3))
  disc(s, wx + ww + 12, wy - 7, 1, at(C.brass, 3))
  for (let i = 0; i < 14; i++) set(s, wx - 10 + (i < 7 ? i * 2 : ww + 6 + (i - 7) * 2), wy - 7, at(C.brass, 3))
  // Painting.
  const { x: px0, y: py0 } = PAINT
  rect(s, px0, py0, px0 + 27, py0 + 19, at(C.brass, 1))
  rect(s, px0 + 1, py0 + 1, px0 + 26, py0 + 18, at(C.brass, 2))
  rect(s, px0 + 2, py0 + 2, px0 + 25, py0 + 17, 0x20140c)
  const glow = ramp('#e8905a', '#ec9a60', '#f0a868', '#f2b474', '#f4c080', '#f6cc8c', '#f8d898', '#f8dca0', '#f8e0a8', '#f8e4b0')
  for (let y = 0; y < 14; y++) for (let x = 0; x < 22; x++) set(s, px0 + 3 + x, py0 + 3 + y, at(glow, y))
  disc(s, px0 + 16, py0 + 8, 2, 0xfff2c0)
  for (let x = 0; x < 22; x++) {
    const h1 = 5 + Math.round(2 * Math.sin(x / 3)), h2 = 3 + Math.round(1.5 * Math.sin(x / 2 + 1))
    for (let y = 0; y < h1; y++) set(s, px0 + 3 + x, py0 + 16 - y, 0x8a5a6a)
    for (let y = 0; y < h2; y++) set(s, px0 + 3 + x, py0 + 16 - y, 0x4a6a4a)
  }
  rect(s, px0 + 3, py0 + 15, px0 + 24, py0 + 16, 0x3a5a8a)
  line(s, px0 + 6, py0 + 15, px0 + 10, py0 + 15, 0xf0c080)
  // Clock face (hands are live).
  disc(s, CLOCK.x, CLOCK.y, 7, at(C.wood, 2))
  disc(s, CLOCK.x, CLOCK.y, 6, at(C.wood, 4))
  disc(s, CLOCK.x, CLOCK.y, 5, 0xf2e8d2)
  for (let hr = 0; hr < 12; hr += 3) set(s, CLOCK.x + Math.round(Math.sin((hr / 12) * TAU) * 4), CLOCK.y - Math.round(Math.cos((hr / 12) * TAU) * 4), 0x4a3a2a)
  // Corkboard with notes and a photo (one note is live).
  rect(s, CORK, 12, CORK + 25, 31, at(C.wood, 3))
  rect(s, CORK + 1, 13, CORK + 24, 30, 0xa87a4a)
  for (let i = 0; i < 40; i++) set(s, CORK + 1 + (hash(i, 21) % 24), 13 + (hash(i, 22) % 18), 0x946a3e)
  rect(s, CORK + 3, 15, CORK + 9, 21, 0xf0d860)
  line(s, CORK + 4, 17, CORK + 8, 17, 0xa08a30)
  line(s, CORK + 4, 19, CORK + 7, 19, 0xa08a30)
  set(s, CORK + 6, 15, 0xd03030)
  rect(s, CORK + 12, 14, CORK + 21, 22, 0xf2f2ea)
  rect(s, CORK + 13, 15, CORK + 20, 20, 0x5a8ac0)
  rect(s, CORK + 13, 18, CORK + 20, 20, 0x4a7a4a)
  set(s, CORK + 18, 16, 0xfff2a0)
  set(s, CORK + 16, 14, 0x3060d0)
  rect(s, CORK + 5, 24, CORK + 12, 29, 0xf090a8)
  line(s, CORK + 6, 26, CORK + 11, 26, 0xb0506a)
  set(s, CORK + 8, 24, 0x30a050)

  // Desk with a drawer unit.
  const dTop = L.deskTop
  const { x0: dx0, x1: dx1 } = DESK
  rect(s, dx0, dTop, dx1, dTop, at(C.wood, 5))
  rect(s, dx0, dTop + 1, dx1, dTop + 2, at(C.wood, 4))
  rect(s, dx0, dTop + 3, dx1, dTop + 3, at(C.wood, 1))
  rect(s, dx0 + 2, dTop + 4, dx0 + 4, FL + 4, at(C.wood, 3))
  set(s, dx0 + 2, dTop + 4, at(C.wood, 4))
  rect(s, dx0 + 4, dTop + 4, dx0 + 4, FL + 4, at(C.wood, 1))
  rect(s, dx1 - 4, dTop + 4, dx1 - 2, FL + 4, at(C.wood, 3))
  rect(s, dx1 - 2, dTop + 4, dx1 - 2, FL + 4, at(C.wood, 1))
  rect(s, dx1 - 34, dTop + 4, dx1 - 5, FL + 3, at(C.wood, 2))
  for (const dy of [0, 8]) {
    rect(s, dx1 - 32, dTop + 6 + dy, dx1 - 7, dTop + 12 + dy, at(C.wood, 3))
    rect(s, dx1 - 32, dTop + 6 + dy, dx1 - 7, dTop + 6 + dy, at(C.wood, 4))
    rect(s, dx1 - 22, dTop + 9 + dy, dx1 - 17, dTop + 9 + dy, at(C.brass, 2))
  }
  // Mug, book stack, desk lamp.
  const mgy = dTop - 1
  spr(s, MUG, mgy - 8, ['.cccccc.', 'mMMMMMMmh', 'mMMMMMMm.h', 'mMMMMMMm.h', 'mMMMMMMmh', 'mMMMMMMm', 'mMMMMMMm', '.mmmmmm.'], { c: 0x5a2e18, m: at(C.mug, 1), M: at(C.mug, 3), h: at(C.mug, 2) })
  rect(s, MUG + 2, mgy - 5, MUG + 5, mgy - 4, 0xd97757)
  const B = (i: number, j: number) => at(BOOKS[i] as number[], j)
  spr(s, 119, dTop - 10, ['rrrrrrrrrrrr', 'RRRRRRRRRRRR', 'bbbbbbbbbbb.', 'BBBBBBBBBBB.', '.gggggggggggg', '.GGGGGGGGGGGG', 'yyyyyyyyyyy..', 'YYYYYYYYYYY..', '.pppppppppp..', '.PPPPPPPPPP..'], {
    r: B(0, 2), R: B(0, 1), b: B(1, 2), B: B(1, 1), g: B(3, 2), G: B(3, 1), y: B(2, 3), Y: B(2, 2), p: B(5, 3), P: B(5, 2),
  })
  rect(s, LAMP - 6, dTop - 2, LAMP + 6, dTop - 1, 0x2e4a3e)
  rect(s, LAMP - 5, dTop - 3, LAMP + 5, dTop - 3, 0x3e6252)
  line(s, LAMP, dTop - 3, LAMP - 4, dTop - 16, 0x5a5a62)
  line(s, LAMP + 1, dTop - 3, LAMP - 3, dTop - 16, 0x7a7a84)
  line(s, LAMP - 4, dTop - 16, LAMP - 12, dTop - 23, 0x5a5a62)
  disc(s, LAMP - 4, dTop - 16, 1, 0x8a8a94)
  spr(s, LAMP - 22, dTop - 30, ['.......sss...', '.....sSSSss..', '...sSSSSSSss.', '.sSSSSSSSSSs.', 'sSSSSSSSSSSSs', 'llllllllllll.'], { s: 0x3e6a56, S: 0x4e8a6e, l: 0x2e4a3e })
  rect(s, LAMP - 19, dTop - 24, LAMP - 13, dTop - 24, 0xfff6d0, true)

  // Bookshelf and its books (the globe and the jar are live).
  const bb = FL - 1
  rect(s, SHELF.x0, SHELF.top, SHELF.x1, bb, at(C.wood, 2))
  rect(s, SHELF.x0, SHELF.top, SHELF.x1, SHELF.top + 1, at(C.wood, 4))
  rect(s, SHELF.x0, SHELF.top, SHELF.x0, bb, at(C.wood, 3))
  rect(s, SHELF.x1, SHELF.top, SHELF.x1, bb, at(C.wood, 1))
  rect(s, SHELF.x0 + 2, SHELF.top + 2, SHELF.x1 - 2, bb - 1, 0x140a06)
  const shelves = [SHELF.top + 16, SHELF.top + 30, SHELF.top + 44, bb]
  for (const sy of shelves) {
    rect(s, SHELF.x0 + 1, sy, SHELF.x1 - 1, sy, at(C.wood, 4))
    rect(s, SHELF.x0 + 1, sy + 1, SHELF.x1 - 1, sy + 1, at(C.wood, 1))
  }
  for (const item of shelfPlan(FL)) {
    if (item.kind !== 'book') continue
    const { x, y: sy, si, h: hh } = item
    const topY = si === 0 ? SHELF.top + 2 : (shelves[si - 1] as number) + 2
    const r = BOOKS[hh % BOOKS.length] as number[]
    const bw = 2 + ((hh >>> 5) % 3), bh = Math.min(sy - topY - 1, 8 + ((hh >>> 9) % 5))
    const lean = (hh >>> 13) % 9 === 0 && x + bw + 3 < SHELF.x1 - 2
    for (let q = 0; q < bw; q++) for (let y = sy - bh; y < sy; y++) set(s, lean ? x + q + Math.floor((sy - y) / 4) : x + q, y, at(r, q === 0 ? 3 : q === bw - 1 ? 1 : 2))
    if (!lean) {
      set(s, x, sy - bh + 2, at(r, 0))
      set(s, x + bw - 1, sy - bh + 2, at(r, 0))
      if (bw > 2) set(s, x + 1, sy - bh + 2, at(C.brass, 2))
      set(s, x + 1, sy - 3, at(C.brass, 1))
    }
  }
  spr(s, SHELF.x0 + 3, SHELF.top - 6, ['.pppppp.', 'pPPPPPPp', '.pppppp.'], { p: 0x9a5634, P: 0xc07048 })

  // Monstera pot.
  rect(s, MONSTERA - 9, FL - 12, MONSTERA + 9, FL + 6, 0xa85e3a)
  rect(s, MONSTERA - 9, FL - 12, MONSTERA + 9, FL - 11, 0xc8784a)
  rect(s, MONSTERA + 6, FL - 10, MONSTERA + 9, FL + 6, 0x86482c)
  rect(s, MONSTERA - 7, FL + 6, MONSTERA + 7, FL + 7, 0x6a3820)

  // Record crate and turntable (the record is live).
  const rpx = RECORD.x, rpy = FL + 4
  rect(s, rpx, rpy - 6, rpx + 28, rpy + 2, at(C.wood, 3))
  rect(s, rpx, rpy - 6, rpx + 28, rpy - 6, at(C.wood, 4))
  rect(s, rpx + 26, rpy - 5, rpx + 28, rpy + 2, at(C.wood, 1))
  for (let i = 0; i < 4; i++) rect(s, rpx + 3 + i * 6, rpy - 4, rpx + 6 + i * 6, rpy + 1, at(BOOKS[i] as number[], 2 + (i % 2)))
  rect(s, rpx + 1, rpy - 12, rpx + 27, rpy - 7, 0x5a3a24)
  rect(s, rpx + 1, rpy - 12, rpx + 27, rpy - 12, 0x7a5034)

  // Rug with border and medallion, fringe; floor cushion.
  const rx0 = 96, rx1 = 222, ry0 = FL + 7, ry1 = h - 2
  for (let y = ry0; y <= ry1; y++) {
    for (let x = rx0; x <= rx1; x++) {
      const bx = Math.min(x - rx0, rx1 - x), by = Math.min(y - ry0, ry1 - y), b = Math.min(bx, by * 3)
      let c = 2
      if (b < 1) c = 0
      else if (b < 4) c = (x + y) % 4 === 0 ? 4 : 1
      else if (b < 5) c = 4
      else {
        const d = Math.abs(x - (rx0 + rx1) / 2) / 3 + Math.abs(y - (ry0 + ry1) / 2)
        c = d < 4 ? 5 : d < 5 ? 1 : ((x >> 2) + y) % 2 ? 2 : 3
      }
      set(s, x, y, at(C.rug, c))
    }
  }
  for (let y = ry0; y <= ry1; y += 2) {
    set(s, rx0 - 1, y, 0xe0d0b0)
    set(s, rx0 - 2, y, 0xc0b090)
    set(s, rx1 + 1, y, 0xe0d0b0)
    set(s, rx1 + 2, y, 0xc0b090)
  }
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 20; x++) {
      const nx = (x - 9.5) / 10, ny = (y - 2.5) / 3
      if (nx * nx + ny * ny <= 1) set(s, 70 + x, FL + 8 + y, ny < -0.3 ? 0x5aa0b0 : ny < 0.4 ? 0x3e8494 : 0x2a6070)
    }
  }
  set(s, 79, FL + 10, 0x2a6070)
  s.ox = 0
}

export function drawRoomLive(s: Surface, L: RoomLayout, t: number, env: RoomEnv): void {
  const FL = L.floor
  const k = (period: number, phase = 0) => osc(t, period, phase)
  s.ox = L.roomX
  const { x: wx, y: wy, w: ww, h: wh } = WIN

  // Stars where the sky shows (not the moon or the mountains), clouds over sky and moon.
  const mask = L.skyMask
  const sky = (x: number, y: number) => (x >= 0 && y >= 0 && x < ww && y < wh ? (mask[y * ww + x] as number) : 0)
  for (let i = 0; i < 40; i++) {
    const sx = hash(i, 1) % ww, sy = hash(i, 2) % (wh - 16)
    const b = 0.5 + 0.5 * Math.sin((t * (0.6 + rnd(i, 4)) + rnd(i, 3)) * TAU)
    if (sky(sx, sy) === 1) set(s, wx + sx, wy + sy, b > 0.85 ? 0xffffff : b > 0.4 ? 0xa8a6e0 : 0x5a5a9a, true)
    if (b > 0.93 && i % 5 === 0) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) if (sky(sx + dx, sy + dy) === 1) set(s, wx + sx + dx, wy + sy + dy, 0x6a6ab0, true)
  }
  for (let c = 0; c < 3; c++) {
    const cxp = (((t * (2 + c) + c * 40) % (ww + 40)) - 20) | 0, cyp = 6 + c * 7
    for (let b = 0; b < 5; b++) {
      const bx = cxp + b * 4 - 8, by = cyp - (b === 2 ? 2 : b % 2)
      for (let y = -2; y <= 1; y++) for (let x = -3; x <= 3; x++) if ((x * x) / 9 + (y * y) / 4 <= 1 && sky(bx + x, by + y) > 0) set(s, wx + bx + x, wy + by + y, y < 0 ? 0x4a4c86 : 0x3a3c74, true)
    }
  }
  for (const [layer, n, base, sz] of [[0, 9, 9, 7], [1, 6, 3, 11]] as const) {
    for (let i = 0; i < n; i++) {
      const px = Math.floor(((i + 0.5) * ww) / n + (rnd(i, layer) - 0.5) * 6), hgt = sz + (hash(i, layer + 9) % 4)
      const sway = Math.round(k(3 + layer, i * 0.13) * (layer ? 0.8 : 0.4))
      for (let j = 0; j < hgt; j++) {
        const half = Math.floor(j * (layer ? 0.45 : 0.4)) + (j % 3 === 2 ? 1 : 0), dx = j < hgt / 3 ? sway : 0
        for (let q = -half; q <= half; q++) set(s, wx + px + q + dx, wy + wh - base - hgt + j, at(C.pine, layer ? 0 : 1), true)
      }
      set(s, wx + px, wy + wh - base, 0x0a0c16, true)
    }
  }
  const { x: cbx, y: cby } = CABIN
  rect(s, cbx, cby, cbx + 9, cby + 6, 0x1a1420, true)
  for (let i = 0; i < 4; i++) line(s, cbx - 1 + i, cby - 1 - i, cbx + 10 - i, cby - 1 - i, i === 0 ? 0xc8cce8 : 0x2a2238, true)
  rect(s, cbx + 2, cby + 2, cbx + 3, cby + 3, 0.85 + 0.15 * k(0.7) > 0.9 ? 0xffd27a : 0xf0b860, true)
  rect(s, cbx + 6, cby + 2, cbx + 7, cby + 3, 0xffc060, true)
  rect(s, cbx + 7, cby - 5, cbx + 8, cby - 2, 0x1a1420, true)
  for (let i = 0; i < 7; i++) {
    const ph = (t * 0.5 + i / 7) % 1
    if (ph < 0.9) disc(s, Math.round(cbx + 8 + Math.sin(ph * 6 + t) * 2 + ph * 4), Math.round(cby - 6 - ph * 16), ph > 0.5 ? 1 : 0, ph > 0.6 ? 0x3a3e6a : 0x5a5e8a, true)
  }
  if (env.weather === 'rain') {
    for (let i = 0; i < 70; i++) {
      const rx = hash(i, 7) % ww, sp = 30 + (hash(i, 8) % 20), ry = ((t * sp + hash(i, 9)) % (wh + 6)) - 6
      for (let j = 0; j < 3; j++) if (ry + j >= 0 && ry + j < wh) set(s, wx + rx - Math.floor((ry + j) / 14), wy + ry + j, j === 2 ? 0xa8b8f0 : 0x6a7ac0, true)
    }
    for (let i = 0; i < 14; i++) {
      const dx = hash(i, 11) % ww, dy = (t * (2 + (i % 3)) + hash(i, 12)) % wh
      set(s, wx + dx, wy + dy, 0xc8d4ff, true)
      if (dy >= 1) set(s, wx + dx, wy + dy - 1, 0x7a8ac8, true)
    }
  } else {
    for (let i = 0; i < 26; i++) {
      const sx = hash(i, 13) % ww, fall = 4 + (hash(i, 14) % 5), sy = (t * fall + hash(i, 15)) % wh
      const x = sx + Math.round(Math.sin(t * 1.3 + i) * 1.5)
      if (x >= 0 && x < ww) set(s, wx + x, wy + sy, 0xe8ecff, true)
    }
  }
  // Muntins and the glass sheen, over the view.
  const mxx = wx + Math.floor(ww / 2), myy = wy + Math.floor(wh * 0.46)
  for (let y = wy; y < wy + wh; y++) {
    set(s, mxx - 1, y, at(C.wood, 4))
    set(s, mxx, y, at(C.wood, 3))
    set(s, mxx + 1, y, at(C.wood, 1))
  }
  for (let x = wx; x < wx + ww; x++) {
    set(s, x, myy - 1, at(C.wood, 4))
    set(s, x, myy, at(C.wood, 3))
    set(s, x, myy + 1, at(C.wood, 1))
  }
  for (let i = 0; i < 7; i++) {
    set(s, wx + 4 + i, wy + 3 + i, 0x5a5ea0, true)
    set(s, mxx + 5 + i, myy + 4 + i, 0x4a4e90, true)
  }
  // Curtains swaying in a draught.
  const curtain = (x0: number, dir: number) => {
    const tieY = wy + 24
    for (let y = wy - 6; y < SILL + 6; y++) {
      const pinch = y < tieY ? 1 - Math.max(0, (y - (tieY - 14)) / 14) * 0.55 : 0.45 + Math.min(0.55, (y - tieY) / 16)
      const width = Math.round(15 * pinch), sway = Math.round((k(5, x0 / 50) * (y > tieY ? 1.5 : 0.6) * (y - wy)) / 40)
      for (let q = 0; q < width; q++) {
        const fold = Math.sin((q / width) * 3.5 * Math.PI + (y > tieY ? 0.6 : 0)) * 0.5 + 0.5
        const v = q === width - 1 ? 0 : Math.min(4, Math.floor(fold * 4 + bayer(q, y) * 0.9))
        set(s, x0 + dir * q + sway * dir, y, at(C.cur, v))
      }
      if (y === tieY || y === tieY + 1) for (let q = 0; q < width + 1; q++) set(s, x0 + dir * q + sway * dir, y, y === tieY ? at(C.brass, 3) : at(C.brass, 1))
    }
  }
  curtain(wx - 14, 1)
  curtain(wx + ww + 13, -1)

  // The cat: breathes, flicks an ear, swishes its tail, slow-blinks.
  const { x: catX, y: catY } = CAT
  const breath = k(3.2) <= 0, ear = t % 6 < 0.25, tail = k(2.2)
  const cat = ['..e....e......', '.eee..eee.....', '.eEe..eEe.....', '.hhhhhhhh.....', 'hhfhhhhfhh....', 'hhhhnnhhhhbbbbbbb.', 'hhhhhhhhhbbbbbbbbb', '.hhhhhhbbbbbbbbbbbb', '.sbbbbbbbbbbbbbbbbb', 'ssssbbsbbsbbsbbbbbs', '.sssssssssssssssss.']
  spr(s, catX, catY, cat.map((r, j) => (j === 0 && ear ? r.replace(/^..e/, '...') : r)), {
    e: at(C.cat, 3), E: 0xc88a8a, h: at(C.cat, 3), f: t % 5 < 0.18 ? at(C.cat, 3) : 0x2a2026, n: 0xd89a9a, b: at(C.cat, 2), s: at(C.cat, 1),
  })
  if (breath) for (let x = catX + 9; x < catX + 18; x++) set(s, x, catY + 5, at(C.cat, 3))
  for (const sx of [11, 14, 17]) {
    set(s, catX + sx, catY + 6, at(C.cat, 1))
    set(s, catX + sx - 1, catY + 7, at(C.cat, 1))
  }
  for (let i = 0; i < 8; i++) {
    const a = i / 7, tx = catX + 18 + Math.round(a * 3 + tail * a * a * 3), ty = catY + 9 + Math.round(a * 5 - a * a * 6 * (0.5 + 0.5 * tail))
    set(s, tx, ty, at(C.cat, 2))
    set(s, tx, ty + 1, at(C.cat, 1))
  }
  // Candle on its dish, and the succulent: in front of the view, so drawn with it.
  const { x: cdx, y: cdy } = CANDLE
  rect(s, cdx - 3, cdy, cdx + 5, cdy, at(C.brass, 2))
  rect(s, cdx - 2, cdy, cdx + 4, cdy, at(C.brass, 3))
  rect(s, cdx, cdy - 8, cdx + 2, cdy - 1, 0xece0c6)
  set(s, cdx, cdy - 8, 0xfff6e0)
  rect(s, cdx + 2, cdy - 7, cdx + 2, cdy - 1, 0xcbbfa4)
  set(s, cdx + 1, cdy - 7, 0xe0d4b8)
  set(s, cdx + 1, cdy - 9, 0x3a2a1a)
  spr(s, wx + ww - 24, SILL - 9, ['..g.g..', '.gGgGg.', 'gGgggGg', '.gGgGg.', '.ppppp.', '.pPPPp.', '.pPPPp.', '..ppp..'], { g: at(C.leaf, 3), G: at(C.leaf, 5), p: 0x9a5634, P: 0xc07048 })

  // Candle flame.
  const fl = k(0.31) + k(0.17, 0.3) * 0.5
  spr(s, CANDLE.x + Math.round(fl * 0.8), CANDLE.y - 14 + (fl > 0.8 ? -1 : 0), ['.y.', '.y.', 'yoy', 'ooo', '.r.'], { y: 0xfff3b0, o: 0xffb84a, r: 0xff7a30 }, 'yor')

  // Clock hands: the real local time; the second hand sweeps.
  const now = new Date(env.now)
  const hA = (((now.getHours() % 12) + now.getMinutes() / 60) / 12) * TAU
  const mA = ((now.getMinutes() + now.getSeconds() / 60) / 60) * TAU
  const sA = ((now.getSeconds() + (t % 1)) / 60) * TAU
  const { x: ckx, y: cky } = CLOCK
  line(s, ckx, cky, ckx + Math.round(Math.sin(hA) * 3), cky - Math.round(Math.cos(hA) * 3), 0x2a1a10)
  line(s, ckx, cky, ckx + Math.round(Math.sin(mA) * 4), cky - Math.round(Math.cos(mA) * 4), 0x2a1a10)
  set(s, ckx + Math.round(Math.sin(sA) * 4), cky - Math.round(Math.cos(sA) * 4), 0xc03020)
  set(s, ckx, cky, at(C.brass, 2))
  // The fluttering note.
  const flutter = k(1.7) > 0.6 ? 1 : 0
  rect(s, CORK + 16, 24, CORK + 23, 30, 0xa87a4a)
  rect(s, CORK + 16, 24 + flutter, CORK + 23, 29 + flutter, 0xa8d8f0)
  line(s, CORK + 17, 26 + flutter, CORK + 22, 26 + flutter, 0x5a88a8)
  set(s, CORK + 19, 24, 0xd0a020)
  // Hanging pothos.
  const { x: hpx, y: hpy } = POTHOS
  line(s, hpx, 0, hpx, hpy, 0x3a2a1a)
  rect(s, hpx - 5, hpy, hpx + 5, hpy + 6, 0xc07048)
  rect(s, hpx - 5, hpy, hpx + 5, hpy, 0xd88a5a)
  rect(s, hpx - 4, hpy + 6, hpx + 4, hpy + 7, 0x9a5634)
  for (let v = 0; v < 5; v++) {
    const vx = hpx - 5 + v * 2.5, len = 14 + (hash(v, 31) % 18)
    for (let j = 0; j < len; j++) {
      const xx = Math.round(vx + Math.sin(t * 0.9 + v + j * 0.15) * (j / len) * 3), yy = hpy + 3 + j
      set(s, xx, yy, at(C.leaf, 1))
      if (j % 4 === 2) spr(s, xx - 1, yy, ['GG', 'gG'], { g: at(C.leaf, 3), G: at(C.leaf, 4 + (v % 2)) })
    }
  }
  // Steam from the mug; dust motes in the lamp's light.
  const dTop = L.deskTop
  for (let i = 0; i < 9; i++) {
    const ph = (t * 0.6 + i / 9) % 1
    if (ph < 0.85) set(s, Math.round(MUG + 4 + Math.sin(ph * 7 + i) * 2), Math.round(dTop - 10 - ph * 18), ph < 0.4 ? 0xc8bcb0 : 0x8a7e78, true)
  }
  for (let i = 0; i < 12; i++) {
    const ph = (t * 0.08 + rnd(i, 41)) % 1
    if ((i + Math.floor(t * 3)) % 4) set(s, Math.round(LAMP - 30 + rnd(i, 42) * 30 + Math.sin(t * 0.7 + i) * 3), Math.round(dTop - 22 + ph * 20), 0xffe6b0, true)
  }
  // Globe (spins) and fairy jar (twinkles) on the shelf; ivy sways.
  for (const item of shelfPlan(FL)) {
    if (item.kind === 'globe') {
      const gx = item.x + 4, gy = item.y - 7, rot = t * 0.4, sy = item.y
      disc(s, gx, gy, 4, 0x2a5a9a)
      for (let yy = -4; yy <= 4; yy++) for (let xx = -4; xx <= 4; xx++) if (xx * xx + yy * yy <= 17 && Math.sin((xx / 4 + rot) * 2.6 + yy * 0.7) > 0.35) set(s, gx + xx, gy + yy, 0x5a9a4a)
      set(s, gx - 2, gy - 2, 0x8ab8e8)
      line(s, gx - 5, gy - 5, gx - 5, gy + 3, at(C.brass, 2))
      rect(s, gx - 2, sy - 2, gx + 2, sy - 1, at(C.brass, 2))
      set(s, gx, gy + 5, at(C.brass, 1))
    } else if (item.kind === 'jar') {
      const { x, y: sy } = item
      rect(s, x, sy - 10, x + 7, sy - 1, 0x2a3a48)
      rect(s, x + 1, sy - 9, x + 6, sy - 1, 0x1a2430)
      rect(s, x + 1, sy - 11, x + 6, sy - 10, at(C.wood, 3))
      for (let i = 0; i < 6; i++) set(s, x + 1 + (hash(i, 51) % 6), sy - 9 + (hash(i, 52) % 8), 0.5 + 0.5 * Math.sin(t * 2 + i * 1.7) > 0.5 ? 0xffe890 : 0xa08a40, true)
    }
  }
  for (let v = 0; v < 3; v++) {
    for (let j = 0; j < 22 + v * 6; j++) {
      const xx = Math.round(SHELF.x0 + 1 + v * 3 + Math.sin(t * 0.8 + v * 2 + j * 0.2) * (j / 30) * 2.5 - (v === 0 ? 1 : 0)), yy = SHELF.top - 4 + j
      set(s, xx, yy, at(C.leaf, 2))
      if (j % 3 === 1) spr(s, xx - 1, yy, ['Gg'], { g: at(C.leaf, 3), G: at(C.leaf, 5) })
    }
  }
  // Monstera leaves bobbing.
  const leaf = (lx: number, ly: number, dir: number, size: number, ph: number) => {
    const sw = Math.round(k(3.5, ph) * 1.2), len = size * 1.5
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < len; x++) {
        const u = x / len, v = (y - size / 2) / (size / 2)
        const half = Math.sin(Math.PI * Math.min(1, u * 1.15)) * (u < 0.15 ? 0.6 + u * 2.6 : 1)
        if (Math.abs(v) > half) continue
        if (Math.abs(v) > 0.3 && (x + Math.round(Math.abs(v) * 3)) % 5 === 0 && u > 0.2 && u < 0.85) continue
        const c = Math.abs(v) < 0.1 ? at(C.leaf, 2) : v < 0 ? at(C.leaf, u < 0.5 ? 5 : 4) : Math.abs(v) > half - 0.2 ? at(C.leaf, 1) : at(C.leaf, 3)
        set(s, lx + (dir > 0 ? x : -x) + sw, ly + y + Math.round(u * u * size * 0.7), c)
      }
    }
  }
  for (const [ox, oy, d, sz, ph] of [[-1, -50, -1, 11, 0], [1, -46, 1, 13, 0.3], [-3, -34, -1, 12, 0.6], [2, -30, 1, 10, 0.9], [0, -58, 1, 9, 0.15], [-2, -22, -1, 8, 0.45]] as const) {
    line(s, MONSTERA, FL - 12, MONSTERA + ox + d * 2, FL + oy + 6, at(C.leaf, 1))
    leaf(MONSTERA + ox, FL + oy, d, sz, ph)
  }
  // Record spinning, tonearm, notes floating up.
  const rpx = RECORD.x, rpy = FL + 4, rcx = rpx + 11, rcy = rpy - 14
  for (let y = -2; y <= 1; y++) for (let x = -10; x <= 10; x++) if ((x * x) / 100 + (y * y) / 4 <= 1) set(s, rcx + x, rcy + y, Math.floor((Math.atan2(y * 2.5, x) + t * 3.3) * 2) % 2 === 0 ? 0x1a1a1e : 0x2a2a32)
  rect(s, rcx - 1, rcy - 1, rcx + 1, rcy, 0xd04a3a)
  line(s, rpx + 24, rpy - 17, rpx + 18, rcy - 1, 0xc0c0c8)
  disc(s, rpx + 24, rpy - 17, 1, 0x8a8a94)
  for (let i = 0; i < 3; i++) {
    const ph = (t * 0.35 + i / 3) % 1
    if (ph < 0.85) spr(s, Math.round(rpx + 14 + Math.sin(ph * 5 + i) * 4 + ph * 10), Math.round(rpy - 20 - ph * 22), ['.##', '.#.', '##.'], { '#': ph < 0.5 ? 0xffd080 : 0xa08060 }, '#')
  }

  // String lights across the whole band.
  s.ox = 0
  const nails: number[] = []
  for (let n = 0; n < L.w; n += 46) nails.push(n)
  nails.push(L.w - 1)
  for (let n = 0; n < nails.length - 1; n++) {
    const a = nails[n] as number, b = nails[n + 1] as number, sag = 5 + k(4, n * 0.2) * 0.8
    for (let x = a; x <= b; x++) set(s, x, 3 + Math.round(4 * sag * ((x - a) / (b - a)) * (1 - (x - a) / (b - a))), 0x140c08)
    set(s, a, 3, at(C.brass, 3))
  }
  for (const bulb of bulbs(L.w, t)) {
    const hue = BULB_HUES[bulb.id % BULB_HUES.length] as readonly [number, number, number]
    const f = 0.7 + 0.3 * bulb.tw
    const c = bulb.on ? (Math.round(hue[0] * f) << 16) | (Math.round(hue[1] * f) << 8) | Math.round(hue[2] * f) : 0x463228
    set(s, bulb.x, bulb.y + 1, 0x2a2a2a)
    rect(s, bulb.x - 1, bulb.y + 2, bulb.x + 1, bulb.y + 4, c, true)
    set(s, bulb.x, bulb.y + 5, c, true)
    if (bulb.on) set(s, bulb.x - 1, bulb.y + 2, 0xffffff, true)
  }
}

export function roomLights(L: RoomLayout, t: number): { fixed: Light[]; live: Light[] } {
  const R = L.roomX
  const fixed: Light[] = [
    { x: R + LAMP - 16, y: L.deskTop - 22, r: 70, k: 1.05, tint: [255, 196, 110], cone: true },
    { x: R + WIN.x + WIN.w / 2 + 14, y: L.floor + 8, r: 34, k: 0.32, tint: [130, 150, 230], flat: 2.6 },
  ]
  const fl = osc(t, 0.31) + osc(t, 0.17, 0.3) * 0.5
  const live: Light[] = [{ x: R + CANDLE.x + 1, y: CANDLE.y - 11, r: 26 + fl * 2, k: 0.55, tint: [255, 170, 80] }]
  const jar = shelfPlan(L.floor).find(p => p.kind === 'jar')
  if (jar) live.push({ x: R + jar.x + 3, y: jar.y - 5, r: 12, k: 0.4, tint: [255, 220, 120] })
  for (const b of bulbs(L.w, t)) if (b.on) live.push({ x: b.x, y: b.y + 3, r: 9 + b.tw * 3, k: 0.35 * b.tw, tint: BULB_HUES[b.id % BULB_HUES.length] as readonly [number, number, number] })
  return { fixed, live }
}
