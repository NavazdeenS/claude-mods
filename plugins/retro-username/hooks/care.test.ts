import { describe, expect, test } from 'claude-code/testing'

import { expireDayOutfit, loadCare, localDay, mergeCare, wearable } from './care'
import { emptyScene, normalizeScene } from './state'

const NOW = Date.parse('2026-10-13T12:00:00Z')
const DAY = 24 * 60 * 60_000

describe('loadCare', () => {
  test('a 0.4.0 record keeps its stats and gains the new fields', async () => {
    const old = { needs: { hunger: 40, happiness: 60, energy: 50, bowl: 2, at: 1 }, petName: 'Bit', outfit: 'party' }
    const care = loadCare(old, NOW)
    expect(care.needs).toEqual({ hunger: 40, happiness: 60, energy: 50, bowl: 2, at: 1 })
    expect(care.petName).toBe('Bit')
    expect(care.outfit).toBe('party')
    expect(care.scene).toBe('auto')
    expect(care.gift).toBeUndefined()
  })

  test('corrupt values load as defaults without throwing', async () => {
    for (const raw of [null, undefined, 'x', 7, { needs: 'bad', petName: 3, outfit: 'tuxedo', scene: 'yes' }]) {
      const care = loadCare(raw, NOW)
      expect(care.petName).toBe('Pixel')
      expect(care.outfit).toBe('auto')
      expect(care.scene).toBe('auto')
      expect(care.needs.at).toBe(NOW)
    }
  })

  test('a JSON round trip keeps gift, day outfit and last gift day', async () => {
    const day = localDay(NOW)
    const care = { ...loadCare(undefined, NOW), gift: { landedAt: NOW, day }, dayOutfit: { outfit: 'crown' as const, day }, lastGiftDay: day, outfit: 'crown' as const }
    expect(loadCare(JSON.parse(JSON.stringify(care)), NOW)).toEqual(care)
  })
})

describe('day outfits', () => {
  test('expire at the next local day and stop being worn', async () => {
    const day = localDay(NOW)
    const care = { ...loadCare(undefined, NOW), outfit: 'crown' as const, dayOutfit: { outfit: 'crown' as const, day } }
    expect(expireDayOutfit(care, NOW)).toEqual(care)
    const later = expireDayOutfit(care, NOW + DAY)
    expect(later.dayOutfit).toBeUndefined()
    expect(later.outfit).toBe('auto')
  })

  test('wear accepts a day outfit only on its day', async () => {
    const care = { ...loadCare(undefined, NOW), dayOutfit: { outfit: 'wizard' as const, day: localDay(NOW) } }
    expect(wearable(care, NOW)).toContain('wizard')
    expect(wearable(care, NOW + DAY)).not.toContain('wizard')
    expect(wearable(loadCare(undefined, NOW), NOW)).not.toContain('crown')
  })
})

test('an empty scene is calm', async () => {
  const s = emptyScene(5)
  expect(s.weather).toBeNull()
  expect(s.reaction).toBeNull()
  expect(s.happenings).toEqual({ butterfly: null, confettiUntil: 0, star: null })
  expect(s.memory.seed).toBe(5)
})

test('a scene saved by 0.4 ({ frame, pet }) is filled out instead of crashing the beat', async () => {
  const old = { frame: 3, pet: null }
  const s = normalizeScene(old)
  expect(s.frame).toBe(3)
  expect(s.memory.lastBubbleAt).toBe(0)
  expect(s.happenings).toEqual({ butterfly: null, confettiUntil: 0, star: null })
  const whole = emptyScene(9)
  expect(normalizeScene(whole)).toEqual(whole)
  expect(normalizeScene(null).frame).toBe(0)
})

describe('mergeCare: the store owns gifts across sessions', () => {
  const day = localDay(NOW)
  const base = loadCare(undefined, NOW)
  test("another session's gift and gift day survive this session's save", async () => {
    const stored = { ...base, gift: { landedAt: NOW, day }, lastGiftDay: day }
    const merged = mergeCare(stored, { ...base, petName: 'Bit' }, false)
    expect(merged.petName).toBe('Bit')
    expect(merged.gift).toEqual({ landedAt: NOW, day })
    expect(merged.lastGiftDay).toBe(day)
  })
  test('a gift change (landing, opening) is taken as given', async () => {
    const stored = { ...base, gift: { landedAt: NOW, day }, lastGiftDay: day }
    const opened = mergeCare(stored, { ...base, lastGiftDay: day }, true)
    expect(opened.gift).toBeUndefined()
  })
})

test('the old scene switch loads as the new choice', async () => {
  expect(loadCare({ scene: true }, NOW).scene).toBe('auto')
  expect(loadCare({ scene: false }, NOW).scene).toBe('off')
  expect(loadCare({ scene: 'city' }, NOW).scene).toBe('city')
  expect(loadCare({ scene: 'moon' }, NOW).scene).toBe('auto')
})
