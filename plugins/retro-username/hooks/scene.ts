// The retro pixel-art scene: the yard is a pixel canvas (two pixels per cell
// row) showing one of three scenes with day, sunset and night palettes and
// pixel weather; the top two band rows are sky with clouds or stars.
import type { SceneChoice, Weather } from '../types'
import { type Canvas, isBlank, write } from './canvas'
import type { World } from './layout'
import { type Pix, blit, get, pixels, rect, set } from './pixel'
import { hash, rand } from './rand'

export type SceneName = 'platformer' | 'city' | 'camp'
export const SCENES: readonly SceneName[] = ['platformer', 'city', 'camp']
export const SCENE_CHOICES: readonly SceneChoice[] = ['auto', 'off', ...SCENES]

export type Phase = 'night' | 'day' | 'sunset'
export const phase = (hour: number): Phase => (hour >= 6 && hour < 17 ? 'day' : hour >= 17 && hour < 19 ? 'sunset' : 'night')

export const STAR_MS = 1500
export const RAIN = '#8fa8ff'
/** A lit window: warmer than the sun's yellow. */
export const WINDOW = '#ffe680'
export const RAINBOW = ['#ff3860', '#ffa640', '#ffd319', '#39ff14']
const SKY: Record<Phase | 'rain', [string, string]> = {
  day: ['#3c74dc', '#5c94fc'],
  sunset: ['#5a2a7a', '#e0705a'],
  night: ['#05051a', '#14143a'],
  rain: ['#2a2d3d', '#3a3f55'],
}

/** Which scene shows: the chosen one, or by local day for auto; null when off. */
export function sceneFor(choice: SceneChoice, now: number): SceneName | null {
  if (choice === 'off') return null
  if (choice !== 'auto') return choice
  const d = new Date(now)
  const day = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000)
  return SCENES[day % SCENES.length] ?? 'platformer'
}

/** The campfire's column in the band, for the camp scene. */
export const campfireX = (world: World): number | undefined =>
  world.yard ? world.yard.x0 + Math.floor((world.yard.x1 - world.yard.x0 + 1) * 0.55) : undefined

export type SceneInput = {
  world: World
  scene: SceneName
  /** Local hour with minutes as a fraction, e.g. 13.5. */
  hour: number
  frame: number
  now: number
  weather: Weather
  star: { x: number; at: number } | null
}

type Ctx = { p: Pix; ph: Phase; frame: number; ground: number }

export function paintScene(c: Canvas, s: SceneInput): void {
  const isRaining = s.weather?.kind === 'rain' && s.now < s.weather.until
  const ph = phase(s.hour)
  const yard = s.world.yard
  drawBandSky(c, yard ? yard.x0 - 2 : c.w, ph, s.frame, isRaining, s.star, s.now)
  if (!yard) return

  const p = pixels(yard.x1 - yard.x0 + 1, c.h * 2)
  const ground = p.h - 2
  const [top, low] = SKY[isRaining ? 'rain' : ph]
  rect(p, 0, 0, p.w - 1, Math.floor(ground / 2) - 1, top)
  rect(p, 0, Math.floor(ground / 2), p.w - 1, ground - 1, low)
  if (s.weather?.kind === 'rainbow' && s.now < s.weather.until) drawRainbow(p, ground)
  const ctx: Ctx = { p, ph, frame: s.frame, ground }
  if (!isRaining) drawSky(ctx, s.scene)
  if (s.scene === 'platformer') drawPlatformer(ctx)
  else if (s.scene === 'city') drawCity(ctx)
  else drawCamp(ctx, campfireX(s.world)! - yard.x0)
  if (isRaining) drawRain(p, ground, s.frame)
  blit(c, p, yard.x0, 0)
}

/** The top two rows of the band outside the yard: clouds, stars, rain, a shooting star. */
function drawBandSky(c: Canvas, until: number, ph: Phase, frame: number, isRaining: boolean, star: SceneInput['star'], now: number): void {
  const put = (x: number, y: number, ch: string, fg: string) => {
    if (x < until && isBlank(c, x, y)) write(c, x, y, ch, { fg })
  }
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < until; x++) {
      const h = hash(x, y)
      if (isRaining) {
        if ((x + y - frame) % 7 === 0 && h % 3 === 0) put(x, y, '╷', RAIN)
      } else if (ph === 'night') {
        if (h % 23 === 0) put(x, y, (h + frame) % 9 === 0 ? '✦' : '·', (h + frame) % 9 === 0 ? '#ffffff' : '#8a84c8')
      }
    }
  }
  if (!isRaining && ph !== 'night') {
    // Two little clouds drifting right, one cell every ten beats.
    for (const k of [0, 1]) {
      const x = ((k * 37 + Math.floor(frame / 10)) % (until + 6)) - 6
      ;[...'▄██▄'].forEach((ch, i) => put(x + i, k, ch, ph === 'sunset' ? '#f0b0a0' : '#e8f0ff'))
    }
  }
  if (star && ph === 'night' && now >= star.at && now - star.at < STAR_MS) {
    const t = (now - star.at) / STAR_MS
    const x = star.x + Math.round(t * 24)
    const y = Math.round(t * 1.5)
    ;[...'━━✦'].forEach((ch, i) => put(x - 2 + i, y, ch, i === 2 ? '#ffffff' : '#8a84c8'))
  }
}

/** Sun by day and sunset, moon by night, in the yard's sky. */
function drawSky({ p, ph }: Ctx, scene: SceneName): void {
  const x = p.w - (scene === 'city' ? 12 : 9)
  if (ph === 'night') {
    const r = scene === 'city' ? 3 : 2
    disc(p, x, 4, r, '#f5f0c0')
    set(p, x - 1, 3, '#c8c0a0')
    set(p, x + 1, 5, '#c8c0a0')
    // A few stars in the yard's sky too.
    for (let i = 0; i < p.w; i += 1) if (hash(i, 99) % 13 === 0) set(p, i, hash(i, 7) % 8, '#b0a8e8')
  } else {
    disc(p, x, ph === 'day' ? 4 : 9, 2, ph === 'day' ? '#ffd319' : '#ff8c1a')
  }
}

function disc(p: Pix, cx: number, cy: number, r: number, color: string): void {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r) set(p, cx + x, cy + y, color)
}

function drawPlatformer({ p, ph, frame, ground }: Ctx): void {
  const night = ph === 'night'
  // Clouds drifting right, one pixel every ten beats.
  for (const k of [0, 1]) {
    const x = ((k * 23 + Math.floor(frame / 10)) % (p.w + 8)) - 8
    const y = 3 + k * 4
    const col = night ? '#3a3a6a' : '#ffffff'
    rect(p, x + 1, y, x + 4, y, col)
    rect(p, x, y + 1, x + 6, y + 1, col)
  }
  // Hills with stripes.
  for (const [cx, r] of [[Math.floor(p.w * 0.3), 11], [Math.floor(p.w * 0.78), 8]] as const) {
    for (let x = cx - r; x <= cx + r; x++) {
      const h = Math.round(Math.sqrt(r * r - (x - cx) ** 2) * 0.8)
      for (let y = ground - h; y < ground; y++) set(p, x, y, (ground - y) % 4 === 0 ? (night ? '#004a18' : '#008000') : night ? '#005a20' : '#00a800')
    }
  }
  // Bushes on the ground line.
  for (const bx of [Math.floor(p.w * 0.12), Math.floor(p.w * 0.6)]) {
    rect(p, bx, ground - 2, bx + 4, ground - 1, night ? '#2a7a2a' : '#58d854')
    rect(p, bx + 1, ground - 3, bx + 3, ground - 3, night ? '#2a7a2a' : '#58d854')
  }
  // Bricks.
  for (let y = ground; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) set(p, x, y, (x + (y % 2) * 2) % 4 === 0 ? '#fc9838' : '#c84c0c')
  }
}

function drawCity({ p, ph, frame, ground }: Ctx): void {
  const night = ph === 'night'
  let seed = 1234
  let x = 0
  let k = 0
  while (x < p.w) {
    const [a, s1] = rand(seed)
    const [b, s2] = rand(s1)
    seed = s2
    const bw = 4 + Math.floor(a * 5)
    const bh = 8 + Math.floor(b * 11)
    const body = night ? (k % 2 ? '#2b2d42' : '#3d405b') : k % 2 ? '#6c7a89' : '#8d99ae'
    rect(p, x, ground - bh, x + bw - 1, ground - 1, body)
    for (let wy = ground - bh + 2; wy < ground - 1; wy += 3) {
      for (let wx = x + 1; wx < x + bw - 1; wx += 2) {
        const flick = hash(wx, wy, Math.floor(frame / 20)) % 17 === 0
        const lit = night && (hash(wx, wy) % 3 !== 0) !== flick
        set(p, wx, wy, lit ? WINDOW : night ? '#1b1d2a' : '#b8c8d8')
      }
    }
    x += bw + 1
    k++
  }
  rect(p, 0, ground, p.w - 1, p.h - 1, '#2a2a2a')
  for (let i = 0; i < p.w; i += 4) set(p, i, p.h - 1, '#d0d0d0')
}

function drawCamp({ p, ph, frame, ground }: Ctx, fire: number): void {
  const night = ph === 'night'
  // Mountains with snow caps.
  const peaks = [[Math.floor(p.w * 0.25), 14], [Math.floor(p.w * 0.6), 18], [Math.floor(p.w * 0.92), 12]] as const
  for (let x = 0; x < p.w; x++) {
    const h = Math.max(0, ...peaks.map(([px, ph2]) => ph2 - Math.abs(x - px)))
    for (let y = ground - h; y < ground; y++) {
      const isSnow = h > 8 && y < ground - h + 3
      set(p, x, y, isSnow ? '#f0f0f0' : night ? '#3a3d4d' : '#6b6f80')
    }
  }
  // Pines.
  for (const tx of [Math.floor(p.w * 0.08), Math.floor(p.w * 0.4), Math.floor(p.w * 0.82)]) {
    for (let i = 0; i < 6; i++) rect(p, tx - Math.floor(i / 2), ground - 8 + i, tx + Math.floor(i / 2), ground - 8 + i, night ? '#0e4a26' : '#1e6b3a')
    rect(p, tx, ground - 2, tx, ground - 1, '#6b3e1e')
  }
  // Tent.
  for (let i = 0; i < 5; i++) rect(p, 2 + 3 - i, ground - 5 + i, 2 + 3 + i, ground - 5 + i, '#d9a441')
  rect(p, 5, ground - 2, 5, ground - 1, '#5a3a10')
  // Ground: grass over dirt.
  rect(p, 0, ground, p.w - 1, ground, night ? '#2a5d22' : '#3a7d2c')
  rect(p, 0, ground + 1, p.w - 1, p.h - 1, '#5a3a1e')
  // Campfire: logs and flickering flames.
  rect(p, fire - 1, ground - 1, fire + 1, ground - 1, '#6b3e1e')
  const flames = ['#ff3b1f', '#ff8c1a', '#ffd319']
  set(p, fire, ground - 2, flames[frame % 3] ?? '#ff8c1a')
  set(p, fire - 1, ground - 2, flames[(frame + 1) % 3] ?? '#ff3b1f')
  set(p, fire + 1, ground - 2, flames[(frame + 2) % 3] ?? '#ffd319')
  set(p, fire, ground - 3, flames[(frame + 1) % 3] ?? '#ffd319')
  if (frame % 2 === 0) set(p, fire, ground - 4, '#ffd319')
  // Fireflies at night.
  if (night) {
    for (let k = 0; k < 5; k++) {
      if ((frame + k) % 4 === 0) continue
      set(p, (hash(k, 1) + Math.floor(frame / 3)) % p.w, ground - 4 - ((hash(k, 2) + frame) % 6), '#d4ff5a')
    }
  }
}

/** A rainbow arc behind the landscape. */
function drawRainbow(p: Pix, ground: number): void {
  const cx = Math.floor(p.w / 2)
  const R = Math.min(Math.floor(p.w / 2) - 1, ground - 2)
  RAINBOW.forEach((color, i) => {
    const r = R - i
    for (let x = cx - r; x <= cx + r; x++) {
      const y = ground - Math.round(Math.sqrt(Math.max(0, r * r - (x - cx) ** 2)))
      set(p, x, y, color)
    }
  })
}

/** One-pixel rain streaks over sky and landscape, above the ground. */
function drawRain(p: Pix, ground: number, frame: number): void {
  for (let y = 0; y < ground; y++) {
    for (let x = 0; x < p.w; x++) {
      if ((x * 3 + y - frame * 2) % 11 === 0 && hash(x, y) % 2 === 0) {
        set(p, x, y, RAIN)
        if (get(p, x, y + 1) !== undefined) set(p, x, y + 1, RAIN)
      }
    }
  }
}
