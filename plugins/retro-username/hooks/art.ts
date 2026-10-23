// The real-pixel band: one frame of the cozy room as RGBA. The wall, floor and
// furniture and the light of the lamp and moon are built once per size; each
// frame copies them, draws what moves, adds the lights that flicker, and shades.
import type { Mood } from '../types'
import { type BoardData, BOARD_W, drawBoardFace, drawChalkDust } from './board'
import { type ClawdLook, drawDeskClawd } from './clawd'
import { type LightMap, addLights, bake, shade } from './light'
import { type Surface, copy, surface } from './px'
import { type RoomLayout, drawRoomLive, drawRoomStatic, roomLayout, roomLights } from './room'

export const ART_ROWS = 14
export const ART_SCALE = 3
export const MIN_COLUMNS = 150
/** The widest Image the engine draws, in cells. */
export const MAX_COLUMNS = 255
export const ART_FRAME_MS = 125
const AMBIENT = 0.55

/**
 * Every how many art beats a frame is sent: full rate while Claude works or
 * thinks, half when idle, slow while asleep. Each frame costs the terminal a
 * whole picture, so a quiet room sends fewer; over SSH every rate halves.
 */
export const artEvery = (mood: Mood, isRemote = false): number =>
  (mood === 'working' || mood === 'thinking' ? 1 : mood === 'sleeping' ? 8 : 2) * (isRemote ? 2 : 1)

export type FrameInput ={ t: number; now: number; board: BoardData; look: ClawdLook; weather: 'snow' | 'rain' }
export type Art = {
  w: number
  h: number
  rgba: Uint8Array
  stats: { staticBuilds: number }
  layout: RoomLayout
  /** The board's numbers last drawn into `base`. */
  boardKey: string
  base: Surface
  work: Surface
  baseLight: LightMap
  workLight: LightMap
}

const cache = new Map<string, Art>()

/** The band's art for `columns` × `rows` cells, built once per size. */
export function artFor(columns: number, rows = ART_ROWS): Art {
  const key = `${columns}x${rows}`
  const hit = cache.get(key)
  if (hit) return hit
  const w = columns * ART_SCALE, h = rows * ART_SCALE * 2
  const layout = roomLayout(w, h)
  const base = surface(w, h)
  drawRoomStatic(base, layout)
  const baseLight = bake(w, h, AMBIENT, roomLights(layout, 0).fixed)
  const art: Art = {
    w,
    h,
    rgba: new Uint8Array(w * h * 4),
    stats: { staticBuilds: 1 },
    layout,
    boardKey: '',
    base,
    work: surface(w, h),
    baseLight,
    workLight: bake(w, h, AMBIENT, []),
  }
  // Keep a handful of sizes: a resize builds one more, an old one is dropped.
  if (cache.size >= 4) cache.delete(cache.keys().next().value as string)
  cache.set(key, art)
  return art
}

export function frame(art: Art, input: FrameInput): Uint8Array {
  const { work, layout: L } = art
  const key = JSON.stringify(input.board)
  if (key !== art.boardKey) {
    drawBoardFace(art.base, 0, BOARD_W, input.board)
    art.boardKey = key
  }
  copy(work, art.base)
  drawChalkDust(work, 0, BOARD_W, input.t)
  drawRoomLive(work, L, input.t, { now: input.now, weather: input.weather })
  const screen = drawDeskClawd(work, L, input.t, input.look)
  addLights(art.workLight, art.baseLight, [...roomLights(L, input.t).live, ...screen])
  shade(work, art.workLight, art.rgba)
  return art.rgba
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Standard padded base64: the runtime's own `toBase64` when it has one. */
export function base64(bytes: Uint8Array): string {
  const native = (bytes as unknown as { toBase64?: () => string }).toBase64
  if (typeof native === 'function') return native.call(bytes)
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] as number, b = bytes[i + 1], c = bytes[i + 2]
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + (b === undefined ? '=' : B64[(n >> 6) & 63]!) + (c === undefined ? '=' : B64[n & 63]!)
  }
  return out
}

/** What the picture says where it cannot be drawn, and to a screen reader. */
export const altText = (d: BoardData): string =>
  [d.name.toUpperCase(), ...d.meters.map(m => `${m.label} ${m.percent === undefined ? '--' : `${Math.round(m.percent)}%`}`)].join(' · ')
