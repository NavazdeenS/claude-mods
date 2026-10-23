import { describe, expect, test } from 'claude-code/testing'

import { loadCare, localDay } from './care'
import { blank } from './canvas'
import { drawGift, drawHappenings, giftX, landGift, moveButterfly, openGift, roll, spawnButterfly } from './happenings'
import { type Bar, layout } from './layout'
import { rand } from './rand'

const NOW = Date.parse('2026-10-13T12:00:00Z')
const BARS: Bar[] = [{ label: 'CONTEXT', percent: 52 }, { label: 'SESSION' }, { label: 'WEEKLY' }]
const world = layout('neo', BARS, 110, true).world!

describe('roll', () => {
  test('nothing happens while busy; odds are about right when free', async () => {
    let seed = 1
    let butterflies = 0
    let stars = 0
    for (let i = 0; i < 20_000; i++) {
      const busy = roll(seed, { isFree: false, isNight: true, hasGift: false, giftToday: false })
      expect(busy.roll).toEqual({ butterfly: false, gift: false, star: false })
      const free = roll(seed, { isFree: true, isNight: true, hasGift: false, giftToday: false })
      if (free.roll.butterfly) butterflies++
      if (free.roll.star) stars++
      seed = free.seed
    }
    expect(butterflies / 20_000).toBeGreaterThan(0.03)
    expect(butterflies / 20_000).toBeLessThan(0.05)
    expect(stars / 20_000).toBeGreaterThan(0.012)
    expect(stars / 20_000).toBeLessThan(0.028)
  })

  test('no second gift today, none while one waits, no stars by day', async () => {
    let seed = 3
    for (let i = 0; i < 5000; i++) {
      const r = roll(seed, { isFree: true, isNight: false, hasGift: i % 2 === 0, giftToday: i % 2 === 1 })
      expect(r.roll.gift).toBe(false)
      expect(r.roll.star).toBe(false)
      seed = r.seed
    }
  })
})

test('a butterfly crosses and leaves', async () => {
  let b: ReturnType<typeof moveButterfly> = spawnButterfly(NOW, 4)
  expect(b?.x).toBe(-2)
  let steps = 0
  while (b && steps < 500) {
    b = moveButterfly(b, world, NOW + steps * 300)
    steps++
  }
  expect(b).toBeNull()
  expect(steps).toBeLessThan(80)
})

describe('gifts', () => {
  test('landing marks today; opening gives one of three treats', async () => {
    const care = landGift(loadCare(undefined, NOW), NOW)
    expect(care.gift?.day).toBe(localDay(NOW))
    expect(care.lastGiftDay).toBe(localDay(NOW))
    const bowl = openGift(care, NOW, 0.1)
    expect(bowl.care.needs.bowl).toBe(3)
    expect(bowl.care.gift).toBeUndefined()
    expect(openGift(care, NOW, 0.5).care.needs.happiness).toBe(Math.min(100, care.needs.happiness + 30))
    const crown = openGift(care, NOW, 0.7).care
    expect(crown.dayOutfit).toEqual({ outfit: 'crown', day: localDay(NOW) })
    expect(crown.outfit).toBe('crown')
    expect(openGift(care, NOW, 0.9).care.outfit).toBe('wizard')
    const none = openGift(loadCare(undefined, NOW), NOW, 0.1)
    expect(none.text).toContain('No gift')
  })

  test('the gift box sits on the yard floor', async () => {
    const c = blank(world.w, world.h)
    drawGift(c, world, landGift(loadCare(undefined, NOW), NOW))
    expect(c.cells[world.yard!.y]?.[giftX(world)!]?.ch).toBe('▣')
  })
})

test('confetti falls only while it lasts; the butterfly is drawn where it is', async () => {
  const on = blank(world.w, world.h)
  drawHappenings(on, { butterfly: { x: 10, y: 1, until: NOW + 1 }, confettiUntil: NOW + 1, star: null }, 0, NOW)
  expect(on.cells[1]?.[10]?.ch).toBe('ʚ')
  expect(on.cells.flat().some(cell => '*·✦'.includes(cell.ch) && cell.ch !== ' ')).toBe(true)
  const off = blank(world.w, world.h)
  drawHappenings(off, { butterfly: null, confettiUntil: NOW, star: null }, 0, NOW)
  expect(off.cells.flat().every(cell => cell.ch === ' ')).toBe(true)
  expect(rand(1)[0]).toBeLessThan(1)
})
