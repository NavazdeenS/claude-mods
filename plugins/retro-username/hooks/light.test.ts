import { describe, expect, test } from 'claude-code/testing'

import { type Light, addLights, bake, shade } from './light'
import { set, surface } from './px'

const red = (out: Uint8Array, w: number, x: number, y: number) => out[(y * w + x) * 4] as number

describe('light', () => {
  test('ambient darkens unlit pixels and spares emitters', async () => {
    const s = surface(2, 1)
    set(s, 0, 0, 0xc8c8c8)
    set(s, 1, 0, 0xc8c8c8, true)
    const out = new Uint8Array(8)
    shade(s, bake(2, 1, 0.5, []), out)
    expect(red(out, 2, 0, 0)).toBe(100)
    expect(red(out, 2, 1, 0)).toBe(200)
    expect(out[3]).toBe(255)
  })

  test('a light brightens inside its radius only', async () => {
    const s = surface(40, 1)
    for (let x = 0; x < 40; x++) set(s, x, 0, 0x808080)
    const lamp: Light = { x: 0, y: 0, r: 10, k: 1, tint: [255, 200, 120] }
    const out = new Uint8Array(160)
    shade(s, bake(40, 1, 0.5, [lamp]), out)
    expect(red(out, 40, 2, 0)).toBeGreaterThan(64)
    expect(red(out, 40, 20, 0)).toBe(64)
  })

  test('addLights touches only the bbox', async () => {
    const base = bake(30, 30, 0.5, [])
    const dst = bake(30, 30, 0.5, [])
    addLights(dst, base, [{ x: 10, y: 10, r: 4, k: 1, tint: [255, 255, 255] }])
    for (let y = 0; y < 30; y++) {
      for (let x = 0; x < 30; x++) {
        if (x >= 6 && x <= 14 && y >= 6 && y <= 14) continue
        const i = (y * 30 + x) * 3
        expect(dst.mul[i]).toBe(base.mul[i] as number)
        expect(dst.add[i]).toBe(base.add[i] as number)
      }
    }
    expect(dst.mul[(10 * 30 + 10) * 3]).toBeGreaterThan(base.mul[(10 * 30 + 10) * 3] as number)
  })

  test('bake plus addLights equals bake of both', async () => {
    const a: Light = { x: 5, y: 5, r: 8, k: 0.8, tint: [255, 170, 80] }
    const b: Light = { x: 12, y: 3, r: 6, k: 0.5, tint: [120, 190, 255] }
    const base = bake(20, 12, 0.55, [a])
    const dst = bake(20, 12, 0.55, [a])
    addLights(dst, base, [b])
    const both = bake(20, 12, 0.55, [a, b])
    for (let i = 0; i < both.mul.length; i++) {
      expect(Math.abs((dst.mul[i] as number) - (both.mul[i] as number))).toBeLessThan(1 / 255)
      expect(Math.abs((dst.add[i] as number) - (both.add[i] as number))).toBeLessThan(1)
    }
  })
})
