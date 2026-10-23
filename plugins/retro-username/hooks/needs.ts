// The pet's needs, 0-100 each, decayed lazily from the time they were last settled.
import type { Needs } from '../types'

export type { Needs }

const MIN = 60_000
const clamp = (n: number) => Math.round(Math.min(100, Math.max(0, n)) * 10) / 10

export const fresh = (now: number): Needs => ({ hunger: 20, happiness: 70, energy: 80, bowl: 1, at: now })

/** Settles needs up to `now`: hunger rises, happiness fades, energy rests back while away. */
export function settle(n: Needs, now: number, isResting: boolean): Needs {
  const m = Math.max(0, (now - n.at) / MIN)
  return {
    ...n,
    hunger: clamp(n.hunger + m / 6),
    happiness: clamp(n.happiness - m / 12),
    energy: clamp(n.energy + (isResting ? m * 2 : 0)),
    at: now,
  }
}

/** Puts food in the bowl (at most three portions). */
export const feed = (n: Needs): Needs => ({ ...n, bowl: Math.min(3, n.bowl + 1), happiness: clamp(n.happiness + 5) })

/** Eats one portion from the bowl, if any. */
export const eat = (n: Needs): Needs =>
  n.bowl > 0 ? { ...n, bowl: n.bowl - 1, hunger: clamp(n.hunger - 45), happiness: clamp(n.happiness + 5) } : n

export const play = (n: Needs): Needs => ({
  ...n,
  happiness: clamp(n.happiness + 20),
  energy: clamp(n.energy - 8),
  hunger: clamp(n.hunger + 4),
})

/** A tool call: a little fun, a little tiring. */
export const work = (n: Needs): Needs => ({ ...n, happiness: clamp(n.happiness + 0.5), energy: clamp(n.energy - 0.7) })

export const isHungry = (n: Needs) => n.hunger >= 60
export const isTired = (n: Needs) => n.energy <= 15
