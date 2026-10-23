// Folds one signal into the scene: the pet's reaction, weather, confetti and speech.
import type { ReactionKind, Scene } from '../types'
import { CONFETTI_MS } from './happenings'
import { rand } from './rand'
import type { SignalEvent } from './signals'
import { type LineKey, say } from './speech'

export const RAIN_MS = 8000
export const RAINBOW_MS = 6000

const REACT: Partial<Record<SignalEvent['signal'], { kind: ReactionKind; ms: number }>> = {
  typing: { kind: 'look-down', ms: 3000 },
  'typing-long': { kind: 'wide-eyes', ms: 3000 },
  'typing-paused': { kind: 'tilt', ms: 3000 },
  'typing-cleared': { kind: 'shrug', ms: 900 },
  'bar-red': { kind: 'pace', ms: 10_000 },
  'bar-moved': { kind: 'hop', ms: 4000 },
  'bar-reset': { kind: 'nap', ms: 8000 },
}
const BAR_KINDS: readonly ReactionKind[] = ['pace', 'hop', 'nap']

export function applySignal(scene: Scene, ev: SignalEvent, now: number): Scene {
  let s = scene
  const running = s.reaction && now < s.reaction.until ? s.reaction : null
  const r = REACT[ev.signal]
  const isTyping = ev.signal.startsWith('typing')
  // Typing never replaces a running bar reaction, and plain typing never replaces another typing reaction.
  const isBlocked =
    (isTyping && running !== null && BAR_KINDS.includes(running.kind)) ||
    (ev.signal === 'typing' && running !== null && running.kind !== 'look-down')
  if (r && !isBlocked) s = { ...s, reaction: { kind: r.kind, until: now + r.ms, cells: ev.cells } }

  if (ev.signal === 'turn-error') {
    s = { ...s, weather: { kind: 'rain', until: now + RAIN_MS }, memory: { ...s.memory, hasRained: true } }
  }
  if (ev.signal === 'turn-ok' && s.memory.hasRained) {
    s = { ...s, weather: { kind: 'rainbow', until: now + RAINBOW_MS }, memory: { ...s.memory, hasRained: false } }
  }
  if (ev.signal === 'long-task-done') s = { ...s, happenings: { ...s.happenings, confettiUntil: now + CONFETTI_MS } }

  const key: LineKey = ev.signal === 'bar-reset' ? (ev.bar === 2 ? 'bar-reset-weekly' : 'bar-reset-session') : ev.signal
  const [pick, seed] = rand(s.memory.seed)
  const spoken = say(s.memory.lastBubbleAt, key, now, pick)
  return {
    ...s,
    bubble: spoken ? spoken.bubble : s.bubble,
    memory: { ...s.memory, seed, lastBubbleAt: spoken ? spoken.lastBubbleAt : s.memory.lastBubbleAt },
  }
}
