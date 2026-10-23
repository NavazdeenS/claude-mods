// Rare surprises in the band: a butterfly, a gift box, confetti.
import type { Butterfly, Care, Happenings } from '../types'
import { localDay } from './care'
import { type Canvas, isBlank, write } from './canvas'
import { GRADIENT, type World } from './layout'
import { hash, rand } from './rand'

/** Frames in an idle minute: the dice are rolled once per minute. */
export const ROLL_EVERY = 200
export const CONFETTI_MS = 4000
export const BUTTERFLY_MS = 30_000

export type RollCtx = { isFree: boolean; isNight: boolean; hasGift: boolean; giftToday: boolean }
export type Roll = { butterfly: boolean; gift: boolean; star: boolean }

/** One idle minute's dice: what turns up, and the seed after. */
export function roll(seed: number, ctx: RollCtx): { roll: Roll; seed: number } {
  const [a, s1] = rand(seed)
  const [b, s2] = rand(s1)
  const [d, s3] = rand(s2)
  return {
    seed: s3,
    roll: {
      butterfly: ctx.isFree && a < 0.04,
      gift: ctx.isFree && !ctx.hasGift && !ctx.giftToday && b < 0.01,
      star: ctx.isFree && ctx.isNight && d < 0.02,
    },
  }
}

export const spawnButterfly = (now: number, seed: number): Butterfly => ({ x: -2, y: 1 + (seed % 3), until: now + BUTTERFLY_MS })

/** Moves the butterfly two cells right; it is gone past the right edge or out of time. */
export function moveButterfly(b: Butterfly | null, world: World, now: number): Butterfly | null {
  if (!b) return null
  const next = { ...b, x: b.x + 2 }
  return next.x > world.w || now >= b.until ? null : next
}

/** Where a gift lands: six cells into the yard, on its floor. */
export const giftX = (world: World): number | undefined => (world.yard ? world.yard.x0 + 6 : undefined)

export function landGift(care: Care, now: number): Care {
  const day = localDay(now)
  return { ...care, gift: { landedAt: now, day }, lastGiftDay: day }
}

/** Opens the waiting gift: a full bowl, a toy, or a day outfit. `r` in [0, 1) picks. */
export function openGift(care: Care, now: number, r: number): { care: Care; text: string } {
  const name = care.petName
  if (!care.gift) return { care, text: `No gift right now. Keep ${name} company and one may turn up.` }
  const { gift: _opened, ...rest } = care
  if (r < 1 / 3) return { care: { ...rest, needs: { ...care.needs, bowl: 3 } }, text: `A snack box! ${name}'s bowl is full.` }
  if (r < 2 / 3) {
    const happiness = Math.min(100, care.needs.happiness + 30)
    return { care: { ...rest, needs: { ...care.needs, happiness } }, text: `A squeaky toy! ${name} is delighted. ♥` }
  }
  const outfit = r < 5 / 6 ? ('crown' as const) : ('wizard' as const)
  return {
    care: { ...rest, outfit, dayOutfit: { outfit, day: localDay(now) } },
    text: `A ${outfit === 'crown' ? 'crown ♛' : 'wizard hat'}! ${name} wears it for the rest of today.`,
  }
}

export function drawGift(c: Canvas, world: World, care: Care): void {
  const x = giftX(world)
  if (care.gift && x !== undefined && world.yard) write(c, x, world.yard.y, '▣', { fg: '#ff2bd6', bold: true })
}

/** The butterfly (flapping, bobbing) and falling confetti. */
export function drawHappenings(c: Canvas, h: Happenings, frame: number, now: number): void {
  const b = h.butterfly
  if (b) write(c, b.x, b.y + (frame % 4 < 2 ? 0 : 1), frame % 2 === 0 ? 'ʚɞ' : 'ɞʚ', { fg: '#ff9ff3', bold: true })
  if (now >= h.confettiUntil) return
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const k = hash(x, y - frame)
      if (k % 29 === 0 && isBlank(c, x, y)) write(c, x, y, '*·✦'[k % 3] ?? '*', { fg: GRADIENT[k % GRADIENT.length] })
    }
  }
}
