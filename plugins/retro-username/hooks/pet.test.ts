import { describe, expect, test } from 'claude-code/testing'

import type { Butterfly, Mood, Reaction } from '../types'
import { blank } from './canvas'
import { giftX } from './happenings'
import { BAR_CELLS, BAR_X, type Bar, type World, drawFloor, layout } from './layout'
import { fresh } from './needs'
import { type Ctx, type Pet, drawPet, newPet, outfitFor, step } from './pet'
import { halves, isSolid } from './pixel'
import { BODIES, PET_STYLES } from './sprites'

const NOW = Date.parse('2026-10-13T12:00:00Z')
const BARS: Bar[] = [{ label: 'CONTEXT', percent: 40 }, { label: 'SESSION' }, { label: 'WEEKLY', percent: 10 }]
const world = layout('neo', BARS, 110, true).world!
const W = world.body.w
const calm = fresh(0)
/** The colour of pixel row `py` in column `x`. */
const pixelAt = (c: ReturnType<typeof blank>, x: number, py: number) => halves(c, x, py >> 1)[py % 2]

type Over = Partial<Omit<Ctx, 'now'>>
const ctxAt = (i: number, mood: Mood, over: Over = {}): Ctx => ({
  world,
  mood,
  needs: calm,
  now: NOW + i * 300,
  reaction: null,
  butterfly: null,
  hasGift: false,
  campfire: null,
  ...over,
})

const run = (pet: Pet, frames: number, mood: Mood, over: Over = {}) => {
  let p = pet
  let ate = 0
  const xs: number[] = []
  for (let i = 0; i < frames; i++) {
    const r = step(p, ctxAt(i, mood, over))
    p = r.pet
    xs.push(p.x)
    if (r.ate) ate++
  }
  return { pet: p, ate, xs }
}
const until = (ms: number) => NOW + ms

describe('pet', () => {
  test('stays inside the band while roaming for a long time', async () => {
    let p = newPet(world, 42)
    const platforms = new Set<string>()
    for (let i = 0; i < 3000; i++) {
      p = step(p, ctxAt(i, 'idle')).pet
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.x + W).toBeLessThanOrEqual(world.w)
      expect(p.y - world.body.h + 1).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThan(world.h * 2)
      if (!p.jump) platforms.add(p.platform)
    }
    expect([...platforms].sort()).toEqual(['floor', 'ledge', 'perch'])
  })

  test('goes to the bench and works while a tool runs', async () => {
    const { pet } = run(newPet(world, 1), 80, 'working')
    expect(pet.act).toBe('use')
    expect(pet.platform).toBe('ledge')
    expect(pet.x).toBe(world.bench.x)
  })

  test('perches on the name while thinking', async () => {
    const { pet } = run(newPet(world, 1), 60, 'thinking')
    expect(pet.platform).toBe('perch')
    expect(pet.act).toBe('sit')
  })

  test('walks to the bowl and eats when hungry', async () => {
    const { pet, ate } = run(newPet(world, 3), 150, 'idle', { needs: { ...calm, hunger: 90, bowl: 2 } })
    expect(ate).toBeGreaterThan(0)
    expect(pet.platform).toBe('floor')
  })

  test('goes to bed when tired', async () => {
    const { pet } = run(newPet(world, 5), 150, 'idle', { needs: { ...calm, energy: 5 } })
    expect(pet.act).toBe('sleep')
    expect(pet.x).toBe(world.bed?.x)
  })

  test('stops to watch you type, but not while working', async () => {
    const look: Reaction = { kind: 'look-down', until: until(60_000) }
    expect(run(newPet(world, 2), 3, 'idle', { reaction: look }).pet.act).toBe('attend')
    expect(run(newPet(world, 2), 80, 'working', { reaction: look }).pet.act).toBe('use')
    expect(run(newPet(world, 2), 3, 'thinking', { reaction: look }).pet.act).toBe('attend')
  })

  test('paces along a red bar and hops to a moved one', async () => {
    const pace: Reaction = { kind: 'pace', until: until(600_000) }
    const { xs } = run(newPet(world, 6), 200, 'idle', { reaction: pace })
    const far = BAR_X + BAR_CELLS - W
    expect(xs).toContain(BAR_X)
    expect(xs).toContain(far)
    const hop: Reaction = { kind: 'hop', until: until(600_000), cells: 20 }
    const hopped = run(newPet(world, 6), 60, 'idle', { reaction: hop }).pet
    expect(hopped.platform).toBe('ledge')
    expect(hopped.x).toBe(BAR_X + 18)
  })

  test('naps on the ledge after a reset', async () => {
    const nap: Reaction = { kind: 'nap', until: until(600_000) }
    const { pet } = run(newPet(world, 8), 80, 'idle', { reaction: nap })
    expect(pet.platform).toBe('ledge')
    expect(pet.act).toBe('sleep')
  })

  test('chases a butterfly and sits by a gift', async () => {
    const butterfly: Butterfly = { x: 20, y: 1, until: until(600_000) }
    const chased = run(newPet(world, 9), 40, 'idle', { butterfly }).pet
    expect(chased.x).toBe(20)
    // Start on an even 20 s window, when the pet sits by its gift, and stay inside it.
    const start = Math.ceil(NOW / 40_000) * 40_000
    let sat = newPet(world, 9)
    for (let i = 0; i < 120; i++) sat = step(sat, { ...ctxAt(0, 'idle', { hasGift: true }), now: start + i * 100 }).pet
    expect(sat.platform).toBe('floor')
    expect(sat.x).toBe(giftX(world)! - W)
    expect(sat.act).toBe('sit')
  })

  test('sits by the campfire at night', async () => {
    const fire = world.yard!.x0 + 20
    // Start on an even 30 s window, when the pet sits by the fire, and stay inside it.
    const start = Math.ceil(NOW / 60_000) * 60_000
    let pet = newPet(world, 4)
    for (let i = 0; i < 120; i++) pet = step(pet, { ...ctxAt(0, 'idle', { campfire: fire }), now: start + i * 100 }).pet
    expect(pet.platform).toBe('floor')
    expect(pet.x).toBe(fire - W - 1)
    expect(pet.act).toBe('sit')
  })

  test('never stands on air: every foot rests on a letter, the girder or the ground, in every style', async () => {
    for (const style of PET_STYLES) {
      const { canvas, world: w } = layout('neo', BARS, 110, true, BODIES[style])
      drawFloor(canvas, w!)
      const ww = w as World
      let p = newPet(ww, 11)
      const floating: string[] = []
      for (let i = 0; i < 3000; i++) {
        const mood = (['idle', 'thinking', 'working', 'idle', 'sleeping'] as const)[Math.floor(i / 300) % 5] ?? 'idle'
        p = step(p, { ...ctxAt(i, mood), world: ww }).pet
        if (!p.jump && !ww.body.feet.every(f => isSolid(canvas, p.x + f, p.y + 1))) floating.push(`${style} ${i}:${p.platform}@${p.x},${p.y}`)
        // Nothing of the body is ever inside a letter or the girder (in the yard it walks past the bowl and bed).
        if (!p.jump && p.platform !== 'floor' && isSolid(canvas, p.x + (ww.body.feet[0] ?? 0), p.y)) floating.push(`${style} ${i}: sunk @${p.x},${p.y}`)
      }
      expect(floating.slice(0, 5)).toEqual([])
    }
  })

  test('the tallest body fits between the name and the girder, and above the name', async () => {
    for (const style of PET_STYLES) {
      const { canvas, world: w } = layout('neo', BARS, 110, true, BODIES[style])
      const b = BODIES[style]
      const ledge = w!.platforms.find(p => p.id === 'ledge')!
      const perch = w!.platforms.find(p => p.id === 'perch')!
      for (let py = ledge.y - b.h + 1; py <= ledge.y; py++) expect(isSolid(canvas, (perch.footholds ?? [])[0] ?? 0, py)).toBe(false)
      expect(perch.y - b.h + 1).toBeGreaterThanOrEqual(0)
    }
  })

  test('jumps are short ballistic arcs, not glides', async () => {
    let p = newPet(world, 13)
    const arcs: { ys: number[]; xs: number[] }[] = []
    let cur: { ys: number[]; xs: number[] } | null = null
    let lastX = p.x
    for (let i = 0; i < 4000; i++) {
      p = step(p, ctxAt(i, i % 600 < 300 ? 'idle' : 'thinking')).pet
      if (p.jump) {
        cur ??= { ys: [], xs: [lastX] }
        cur.ys.push(p.y)
        cur.xs.push(p.x)
      } else if (cur) {
        arcs.push(cur)
        cur = null
      }
      lastX = p.x
    }
    expect(arcs.length).toBeGreaterThan(5)
    for (const { ys, xs } of arcs) {
      expect(ys.length).toBeLessThanOrEqual(7)
      const top = Math.min(...ys)
      const peak = ys.indexOf(top)
      for (let k = 1; k <= peak; k++) expect(ys[k] ?? 0).toBeLessThanOrEqual(ys[k - 1] ?? 0)
      for (let k = peak + 1; k < ys.length; k++) expect(ys[k] ?? 0).toBeGreaterThanOrEqual(ys[k - 1] ?? 0)
      expect(ys.filter(y => y === top).length).toBeLessThanOrEqual(2)
      for (let k = 1; k < xs.length; k++) expect(Math.abs((xs[k] ?? 0) - (xs[k - 1] ?? 0))).toBeLessThanOrEqual(4)
    }
  })

  test('the feet are one pixel and stand on the girder\'s top pixel; a cheer is a real hop', async () => {
    const look = { mood: 'idle' as Mood, outfit: 'none' as const, tool: undefined, isSweating: false, frame: 1, needs: calm, reaction: null, isRaining: false, now: NOW }
    for (const style of PET_STYLES) {
      const b = BODIES[style]
      const { canvas, world: w } = layout('neo', BARS, 110, true, b)
      const p = { ...newPet(w!), x: 2, act: 'stand' as const, t: 5 }
      const girder = Array.from({ length: b.w }, (_, col) => pixelAt(canvas, p.x + col, p.y + 1))
      drawPet(canvas, p, w!, look)
      for (let col = 0; col < b.w; col++) {
        expect(pixelAt(canvas, p.x + col, p.y) === '#d97757').toBe(b.feet.includes(col))
        expect(pixelAt(canvas, p.x + col, p.y + 1)).toBe(girder[col])
      }
      // One pixel of leg: right above the feet is body, wider than the feet.
      expect([...(b.stand[b.h - 2] ?? '')].filter(ch => ch !== '.').length).toBeGreaterThan(b.feet.length)
      const hop = blank(w!.w, w!.h)
      drawPet(hop, { ...p, act: 'cheer' }, w!, { ...look, frame: 2 })
      expect(pixelAt(hop, p.x + (b.feet[0] ?? 0), p.y)).toBeUndefined()
      // Two pixels up, with the feet tucked in: the lowest body pixel is three above where the feet stood.
      expect(pixelAt(hop, p.x + (b.feet[0] ?? 0), p.y - 2)).toBeUndefined()
      expect(pixelAt(hop, p.x + (b.feet[0] ?? 0), p.y - 3)).toBe('#d97757')
    }
  })

  test('outfits follow what it is doing unless one is chosen', async () => {
    const p = newPet(world)
    expect(outfitFor('auto', { ...p, act: 'use' }, 'working', false, 12)).toBe('hardhat')
    expect(outfitFor('auto', p, 'happy', false, 12)).toBe('party')
    expect(outfitFor('auto', p, 'idle', false, 2)).toBe('nightcap')
    expect(outfitFor('auto', p, 'idle', true, 12)).toBe('shades')
    expect(outfitFor('party', p, 'working', false, 12)).toBe('party')
    expect(outfitFor('crown', p, 'working', false, 12)).toBe('crown')
  })

  test('draws an umbrella in the rain, a crown, and a note while napping', async () => {
    const base = { mood: 'idle' as Mood, tool: undefined, isSweating: false, frame: 1, needs: calm, now: NOW }
    const p = { ...newPet(world), act: 'stand' as const }
    const wet = blank(world.w, world.h)
    drawPet(wet, p, world, { ...base, outfit: 'none', reaction: null, isRaining: true })
    expect(wet.cells.flat().some(cell => cell.ch === '☂')).toBe(true)
    const royal = blank(world.w, world.h)
    drawPet(royal, p, world, { ...base, outfit: 'crown', reaction: null, isRaining: false })
    expect(pixelAt(royal, p.x, p.y - world.body.h)).toBe('#ffd319')
    const nap = blank(world.w, world.h)
    drawPet(nap, { ...p, act: 'sleep' }, world, { ...base, outfit: 'none', reaction: { kind: 'nap', until: NOW + 1 }, isRaining: false })
    expect(nap.cells.flat().some(cell => cell.ch === '♪')).toBe(true)
  })

  test('drawing never leaves the canvas or changes its size', async () => {
    let p = newPet(world, 9)
    const kinds: Reaction[] = [null, { kind: 'look-down', until: until(1e9) }, { kind: 'pace', until: until(1e9) }, { kind: 'shrug', until: until(1e9) }]
    for (let i = 0; i < 400; i++) {
      const mood: Mood = (['idle', 'working', 'thinking', 'happy', 'error'] as const)[Math.floor(i / 80)] ?? 'idle'
      const reaction = kinds[i % kinds.length] ?? null
      p = step(p, ctxAt(i, mood, { reaction })).pet
      const c = blank(world.w, world.h)
      drawPet(c, p, world, { mood, outfit: 'wizard', tool: 'Bash', isSweating: true, frame: i, needs: calm, reaction, isRaining: i % 2 === 0, now: NOW + i * 300 })
      expect(c.cells.length).toBe(world.h)
      for (const row of c.cells) expect(row.length).toBe(world.w)
    }
  })
})
