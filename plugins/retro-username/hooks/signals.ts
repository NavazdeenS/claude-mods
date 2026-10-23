// Session events, named: the one vocabulary the pet's reactions, weather and speech share.
export type Signal =
  | 'typing'
  | 'typing-long'
  | 'typing-paused'
  | 'typing-cleared'
  | 'commit'
  | 'tests-passed'
  | 'tests-failed'
  | 'grep-streak'
  | 'turn-error'
  | 'turn-ok'
  | 'long-task-done'
  | 'bar-red'
  | 'bar-moved'
  | 'bar-reset'
  | 'hungry'
  | 'going-to-eat'

/** A signal; bar signals name the bar (0 context, 1 session, 2 weekly) and its filled cells. */
export type SignalEvent = { signal: Signal; bar?: 0 | 1 | 2; cells?: number }
export type Typing = { at: number; length: number; isLong: boolean; hasPaused: boolean }

export const LONG_DRAFT = 500
export const PAUSE_MS = 20_000
export const LONG_TURN_MS = 120_000
export const GREP_STREAK = 5
export const HUNGRY_NAG_MS = 10 * 60_000
export const QUEUE_MAX = 50

const COMMIT = /^git(\s+-C\s+\S+)?\s+commit(\s|$)/
const TESTS = /^(npm\s+(run\s+)?test|npx\s+(vitest|jest)|vitest|jest|pytest|python3?\s+-m\s+pytest|go\s+test|cargo\s+test|claude\s+plugin\s+test)(\s|$)/

/**
 * The simple commands of a shell line whose exit status is the call's: those
 * followed by nothing or only by `&&` (a later `|`, `;`, `||` or newline
 * replaces their status with another command's).
 */
function ownStatus(command: string): string[] {
  const parts = command.split(/(&&|\|\||;|\||\n)/)
  const out: string[] = []
  for (let i = 0; i < parts.length; i += 2) {
    const later = parts.filter((_, k) => k > i && k % 2 === 1)
    const text = (parts[i] ?? '').trim()
    if (text && later.every(sep => sep === '&&')) out.push(text)
  }
  return out
}

/** Signals from a Bash call: a commit that went through, a test run that passed or failed. */
export function fromBash(command: string, isError: boolean): Signal[] {
  const parts = ownStatus(command)
  const out: Signal[] = []
  if (!isError && parts.some(p => COMMIT.test(p))) out.push('commit')
  if (parts.some(p => TESTS.test(p))) out.push(isError ? 'tests-failed' : 'tests-passed')
  return out
}

/** Counts consecutive searches; fires once when a run reaches GREP_STREAK. */
export function grepStreak(run: number, tool: string): { run: number; fire: boolean } {
  if (tool !== 'Grep' && tool !== 'Glob') return { run: 0, fire: false }
  return { run: run + 1, fire: run + 1 === GREP_STREAK }
}

export function fromTurn(reason: string, durationMs: number): Signal[] {
  if (reason === 'answer') return durationMs > LONG_TURN_MS ? ['turn-ok', 'long-task-done'] : ['turn-ok']
  if (reason === 'error' || reason === 'refusal') return ['turn-error']
  return []
}

/** Bar signals between two readings of [context, session, weekly] percents. */
export function fromBars(prev: readonly (number | undefined)[], next: readonly (number | undefined)[]): SignalEvent[] {
  const out: SignalEvent[] = []
  for (const bar of [0, 1, 2] as const) {
    const a = prev[bar]
    const b = next[bar]
    if (a === undefined || b === undefined) continue
    if (a < 90 && b >= 90) out.push({ signal: 'bar-red', bar })
    else if (b - a >= 5) out.push({ signal: 'bar-moved', bar })
    if (bar !== 0 && a - b >= 20) out.push({ signal: 'bar-reset', bar })
  }
  return out
}

/** A draft edit: the new typing state and its signals. A long draft fires once until it is cleared. */
export function fromEdit(prev: Typing | null, text: string, now: number): { typing: Typing | null; signals: Signal[] } {
  if (text.length === 0) return { typing: null, signals: prev && prev.length > 0 ? ['typing-cleared'] : [] }
  const isLong = text.length > LONG_DRAFT
  const signals: Signal[] = ['typing']
  if (isLong && !prev?.isLong) signals.push('typing-long')
  return { typing: { at: now, length: text.length, isLong: isLong || (prev?.isLong ?? false), hasPaused: false }, signals }
}

/** Fires once when a non-empty draft has sat untouched for PAUSE_MS. */
export function pauseCheck(typing: Typing | null, now: number): { typing: Typing | null; fire: boolean } {
  if (!typing || typing.hasPaused || now - typing.at < PAUSE_MS) return { typing, fire: false }
  return { typing: { ...typing, hasPaused: true }, fire: true }
}

/** Fires once when the pet has been hungry for HUNGRY_NAG_MS; resets when it is not hungry. */
export function hungerCheck(
  m: { hungrySince: number; hasSaidHungry: boolean },
  isHungry: boolean,
  now: number,
): { hungrySince: number; hasSaidHungry: boolean; fire: boolean } {
  if (!isHungry) return { hungrySince: 0, hasSaidHungry: false, fire: false }
  const since = m.hungrySince || now
  const fire = !m.hasSaidHungry && now - since >= HUNGRY_NAG_MS
  return { hungrySince: since, hasSaidHungry: m.hasSaidHungry || fire, fire }
}

/** Adds an event to the queue: one `typing` at most, QUEUE_MAX events at most (oldest dropped). */
export function enqueue(queue: readonly SignalEvent[], ev: SignalEvent): SignalEvent[] {
  if (ev.signal === 'typing' && queue.some(q => q.signal === 'typing')) return [...queue]
  return [...queue, ev].slice(-QUEUE_MAX)
}
