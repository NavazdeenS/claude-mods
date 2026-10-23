import type { Happenings, Scene } from '../types'

export const noHappenings = (): Happenings => ({ butterfly: null, confettiUntil: 0, star: null })

export const emptyScene = (seed: number): Scene => ({
  frame: 0,
  pet: null,
  weather: null,
  bubble: null,
  happenings: noHappenings(),
  reaction: null,
  memory: { seed, lastBubbleAt: 0, hasRained: false, hungrySince: 0, hasSaidHungry: false },
})

const record = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {})

/** A scene of any shape (an older version's survives a reload) filled out to the current one. */
export function normalizeScene(raw: unknown): Scene {
  const base = emptyScene(7)
  const r = record(raw)
  return {
    ...base,
    ...(r as Partial<Scene>),
    happenings: { ...base.happenings, ...(record(r.happenings) as Partial<Scene['happenings']>) },
    memory: { ...base.memory, ...(record(r.memory) as Partial<Scene['memory']>) },
    frame: typeof r.frame === 'number' ? r.frame : 0,
  }
}
