// The light pass: an ambient darkening and coloured lights with banded falloff,
// kept as a light map (a multiplier and an added tint per pixel) so lights that
// never change are baked once and only the live ones are added each frame.
import type { Surface } from './px'

export type Light = {
  x: number
  y: number
  r: number
  k: number
  tint: readonly [number, number, number]
  /** Lights only below its source, narrowing with depth (a lamp shade). */
  cone?: boolean
  /** Squashes the falloff vertically (a patch of light on the floor). */
  flat?: number
}
export type LightMap = { w: number; h: number; mul: Float32Array; add: Float32Array }

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16)
// Square roots by table: Math calls are slow in the mod runtime.
const ROOTS = new Float32Array(8192).map((_, i) => Math.sqrt(i))
const root = (d2: number) => (d2 < 8192 ? (ROOTS[d2 | 0] as number) : Math.sqrt(d2))

export function bake(w: number, h: number, ambient: number, lights: readonly Light[]): LightMap {
  const mul = new Float32Array(w * h * 3)
  for (let i = 0; i < w * h; i++) {
    mul[i * 3] = ambient
    mul[i * 3 + 1] = ambient
    mul[i * 3 + 2] = ambient * 1.05
  }
  const lm = { w, h, mul, add: new Float32Array(w * h * 3) }
  for (const L of lights) addOne(lm, L)
  return lm
}

/** `dst` = `base` plus `lights`; `dst` must already hold `base`, and only each light's box is touched. */
export function addLights(dst: LightMap, base: LightMap, lights: readonly Light[]): void {
  dst.mul.set(base.mul)
  dst.add.set(base.add)
  for (const L of lights) addOne(dst, L)
}

function addOne(lm: LightMap, L: Light): void {
  const x0 = Math.max(0, Math.floor(L.x - L.r)), x1 = Math.min(lm.w - 1, Math.ceil(L.x + L.r))
  const y0 = Math.max(0, Math.floor(L.y - L.r)), y1 = Math.min(lm.h - 1, Math.ceil(L.y + L.r))
  const [tr, tg, tb] = L.tint
  const mr = tr / 255, mg = tg / 255, mb = tb / 255, ar = tr * 0.06, ag = tg * 0.06, ab = tb * 0.06
  const r2 = L.r * L.r, k6 = L.k * 6
  const { mul, add, w } = lm
  for (let y = y0; y <= y1; y++) {
    if (L.cone && y < L.y - 2) continue
    const dy = L.cone ? (y - L.y) * 0.8 : L.flat ? (y - L.y) * L.flat : y - L.y
    const dy2 = dy * dy
    if (dy2 > r2) continue
    const squeeze = L.cone ? 1 - Math.min(0.6, (y - L.y) / 60) : 1
    const brow = (y & 3) * 4
    for (let x = x0; x <= x1; x++) {
      const dx = (x - L.x) * squeeze
      const d2 = dx * dx + dy2
      if (d2 > r2) continue
      const f = 1 - root(d2) / L.r
      const q = ((f * f * k6 + (BAYER[brow + (x & 3)] as number) * 0.6) | 0) / 6
      if (q <= 0) continue
      const i = (y * w + x) * 3
      mul[i] = (mul[i] as number) + q * mr
      mul[i + 1] = (mul[i + 1] as number) + q * mg
      mul[i + 2] = (mul[i + 2] as number) + q * mb
      add[i] = (add[i] as number) + q * ar
      add[i + 1] = (add[i + 1] as number) + q * ag
      add[i + 2] = (add[i + 2] as number) + q * ab
    }
  }
}

/** Writes `s` lit by `lm` into `out` as RGBA; self-lit pixels keep their colour. */
export function shade(s: Surface, lm: LightMap, out: Uint8Array): void {
  const n = s.w * s.h
  const { col, emit } = s
  const { mul, add } = lm
  // One little-endian word per pixel: 0xAABBGGRR.
  const words = new Uint32Array(out.buffer, out.byteOffset, n)
  for (let i = 0; i < n; i++) {
    const c = col[i] as number
    let r = c >>> 16, g = (c >>> 8) & 255, b = c & 255
    if (!emit[i]) {
      const j = i * 3
      r = r * (mul[j] as number) + (add[j] as number)
      g = g * (mul[j + 1] as number) + (add[j + 1] as number)
      b = b * (mul[j + 2] as number) + (add[j + 2] as number)
      if (r > 255) r = 255
      if (g > 255) g = 255
      if (b > 255) b = 255
    }
    words[i] = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0
  }
}
