import type { Care, Outfit, SceneChoice } from '../types'
import { type Needs, fresh } from './needs'
import { DEFAULT_STYLE, PET_STYLES } from './sprites'

export const BASE_OUTFITS: readonly Outfit[] = ['auto', 'none', 'hardhat', 'party', 'nightcap', 'shades']
const DAY_OUTFITS: readonly Outfit[] = ['crown', 'wizard']

const pad = (n: number) => String(n).padStart(2, '0')

/** The local calendar day of a time, as YYYY-MM-DD. */
export const localDay = (t: number): string => {
  const d = new Date(t)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export const newCare = (now: number): Care => ({ needs: fresh(now), petName: 'Pixel', outfit: 'auto', scene: 'auto', style: DEFAULT_STYLE })

const CHOICES: readonly SceneChoice[] = ['auto', 'off', 'platformer', 'city', 'camp']

/** A stored scene setting of any version: 0.5's choice, or the earlier on/off switch. */
const sceneOf = (v: unknown): SceneChoice => (v === false ? 'off' : (CHOICES.find(c => c === v) ?? 'auto'))

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const record = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {})

/** Reads a stored record of any age into a whole Care, keeping whatever it has. */
export function loadCare(raw: unknown, now: number): Care {
  const base = newCare(now)
  const r = record(raw)
  const n = record(r.needs)
  const needs: Needs = {
    hunger: num(n.hunger, base.needs.hunger),
    happiness: num(n.happiness, base.needs.happiness),
    energy: num(n.energy, base.needs.energy),
    bowl: num(n.bowl, base.needs.bowl),
    at: num(n.at, now),
  }
  const outfit = [...BASE_OUTFITS, ...DAY_OUTFITS].find(o => o === r.outfit) ?? 'auto'
  const care: Care = {
    needs,
    petName: typeof r.petName === 'string' && r.petName ? r.petName.slice(0, 12) : base.petName,
    outfit,
    scene: sceneOf(r.scene),
    style: PET_STYLES.find(s => s === r.style) ?? DEFAULT_STYLE,
  }
  const gift = record(r.gift)
  if (typeof gift.landedAt === 'number' && typeof gift.day === 'string') care.gift = { landedAt: gift.landedAt, day: gift.day }
  const day = record(r.dayOutfit)
  if ((day.outfit === 'crown' || day.outfit === 'wizard') && typeof day.day === 'string') care.dayOutfit = { outfit: day.outfit, day: day.day }
  if (typeof r.lastGiftDay === 'string') care.lastGiftDay = r.lastGiftDay
  return expireDayOutfit(care, now)
}

/** Drops a day outfit once its day has passed, and stops wearing it. */
export function expireDayOutfit(care: Care, now: number): Care {
  if (!care.dayOutfit || care.dayOutfit.day === localDay(now)) return care
  const { dayOutfit, ...rest } = care
  return { ...rest, outfit: care.outfit === dayOutfit.outfit ? 'auto' : care.outfit }
}

/** Outfits `/pet wear` accepts now. */
export const wearable = (care: Care, now: number): Outfit[] =>
  care.dayOutfit?.day === localDay(now) ? [...BASE_OUTFITS, care.dayOutfit.outfit] : [...BASE_OUTFITS]

/**
 * What to save when another session may have written the store: gifts are the
 * store's (one per day across sessions) unless this save is itself a gift change.
 */
export function mergeCare(stored: Care | null, next: Care, isGiftChange: boolean): Care {
  if (!stored || isGiftChange) return next
  const { gift: _gift, lastGiftDay: _day, dayOutfit: _outfit, ...rest } = next
  const merged: Care = { ...rest }
  if (stored.gift) merged.gift = stored.gift
  const days = [stored.lastGiftDay, next.lastGiftDay].filter((d): d is string => d !== undefined).sort()
  if (days.length > 0) merged.lastGiftDay = days[days.length - 1]
  if (stored.dayOutfit) merged.dayOutfit = stored.dayOutfit
  return merged
}
