import type { Bubble, Pet } from '../types'
import { type Canvas, write } from './canvas'
import { BODIES, type Body, DEFAULT_STYLE } from './sprites'
import type { Signal } from './signals'

export type LineKey = Signal | 'bar-reset-weekly' | 'bar-reset-session'

export const BUBBLE_MS = 3000
export const BUBBLE_GAP_MS = 60_000

export const LINES: Partial<Record<LineKey, readonly string[]>> = {
  commit: ['ship it!', 'committed ✓', 'nice commit'],
  'tests-passed': ['tests green ✓', 'all passing!'],
  'tests-failed': ['uh oh, red', "we'll fix it"],
  'grep-streak': ['so many greps…', 'searching…'],
  'turn-error': ['ouch', 'that hurt'],
  'long-task-done': ['phew, done!', 'that was a big one'],
  'going-to-eat': ['brb snack'],
  hungry: ['feed me? /pet feed'],
  'typing-long': ['ooh, a long one'],
  'bar-reset-weekly': ['fresh week!'],
  'bar-reset-session': ['new session!'],
}

const BYPASS: ReadonlySet<LineKey> = new Set<LineKey>(['turn-error', 'bar-reset-weekly', 'bar-reset-session'])

/** A bubble for `key`, or null when it has no lines or the last bubble was under a minute ago. `r` in [0, 1) picks the line. */
export function say(
  lastBubbleAt: number,
  key: LineKey,
  now: number,
  r: number,
): { bubble: NonNullable<Bubble>; lastBubbleAt: number } | null {
  const lines = LINES[key]
  if (!lines || lines.length === 0) return null
  if (!BYPASS.has(key) && now - lastBubbleAt < BUBBLE_GAP_MS) return null
  const text = lines[Math.floor(r * lines.length)] ?? lines[0] ?? ''
  return { bubble: { text, until: now + BUBBLE_MS }, lastBubbleAt: now }
}

/** Draws `‹ text ›` above the pet's head, on the side it faces, kept inside the band. */
export function drawBubble(c: Canvas, pet: Pet, bubble: Bubble, now: number, body: Body = BODIES[DEFAULT_STYLE]): void {
  if (!bubble || now >= bubble.until) return
  const text = `‹ ${bubble.text} ›`
  const len = [...text].length
  const y = Math.max(0, ((pet.y - body.h + 1) >> 1) - 1)
  const want = pet.facing > 0 ? pet.x + body.w + 1 : pet.x - len - 1
  const x = Math.max(0, Math.min(c.w - len, want))
  write(c, x, y, text, { fg: '#ffffff', bg: '#3a2a5a', bold: true })
}
