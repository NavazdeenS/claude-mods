import type { Meter } from '../types'

export const BAR_CELLS = 24

/** Filled and empty cells of a `cells`-wide bar for `percent` (clamped 0-100). */
export function barCells(percent: number, cells = BAR_CELLS): { filled: string; empty: string } {
  const n = Math.round((Math.min(100, Math.max(0, percent)) / 100) * cells)
  return { filled: '█'.repeat(n), empty: '░'.repeat(cells - n) }
}

/** Green under 70%, amber under 90%, red from there. */
export const barColor = (percent: number): string =>
  percent >= 90 ? '#ff3860' : percent >= 70 ? '#ffa640' : '#39ff14'

/** "3d 4h", "5h 12m" or "12m" until `resetsAt`; undefined without one. */
export function resetsIn(weekly: Meter, now: number): string | undefined {
  if (!weekly.resetsAt) return undefined
  const mins = Math.max(0, Math.round((Date.parse(weekly.resetsAt) - now) / 60_000))
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`
}
