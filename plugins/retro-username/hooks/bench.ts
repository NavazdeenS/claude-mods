// The benchmark behind `/pet bench`: the 0.6 text band against the 0.7 real-pixel
// band, drawn over the same scripted minute of activity in this runtime. It
// times what each path does per frame and counts the bytes it hands the terminal.
import type { Mood } from '../types'
import { ART_FRAME_MS, artFor, base64, frame } from './art'
import type { Run } from './canvas'
import { runs } from './canvas'
import { type Bar, layout } from './layout'
import { drawPet, newPet } from './pet'
import { paintScene } from './scene'
import { BODIES } from './sprites'

export type PathStats = { medianMs: number; p95Ms: number; maxMs: number; bytesPerFrame: number; fps: number }
export type BenchReport = { columns: number; frames: number; old: PathStats; next: PathStats }

const OLD_FRAME_MS = 300
const BARS: Bar[] = [
  { label: 'CONTEXT', percent: 42, tail: '84k/200k' },
  { label: 'SESSION', percent: 73, tail: 'resets in 2h 10m' },
  { label: 'WEEKLY', percent: 18, tail: 'resets in 4d 3h' },
]
/** Every ten seconds of the scripted minute, Claude does something else. */
const SCRIPT: { mood: Mood; tool?: string }[] = [{ mood: 'idle' }, { mood: 'working', tool: 'Edit' }, { mood: 'working', tool: 'Bash' }, { mood: 'thinking' }, { mood: 'error' }, { mood: 'idle' }]
const at = (ms: number) => SCRIPT[Math.floor(ms / 10_000) % SCRIPT.length] as { mood: Mood; tool?: string }

const utf8 = (text: string) => {
  let n = 0
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4
  }
  return n
}

/** What a row of runs costs on the wire: an SGR sequence (colours, bold) per run, the text, a line break per row. */
export function ansiBytes(rows: readonly (readonly Run[])[]): number {
  let n = 0
  for (const row of rows) {
    for (const run of row) n += 19 + utf8(run.text)
    n += 2
  }
  return n
}

function stats(times: number[], bytes: number[], intervalMs: number): PathStats {
  const s = [...times].sort((a, b) => a - b)
  const pick = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))] as number
  return {
    medianMs: pick(0.5),
    p95Ms: pick(0.95),
    maxMs: s[s.length - 1] as number,
    bytesPerFrame: Math.round(bytes.reduce((a, b) => a + b, 0) / bytes.length),
    fps: 1000 / intervalMs,
  }
}

export function bench(columns: number, frames: number, now: number): BenchReport {
  // 0.6: lay the band out, paint the scene, draw the pet, split rows into runs.
  const oldTimes: number[] = [], oldBytes: number[] = []
  for (let f = 0; f < frames; f++) {
    const ms = f * OLD_FRAME_MS, t = now + ms
    const t0 = performance.now()
    const { canvas, world } = layout('navazdeen', BARS, columns - 4, true, BODIES.mochi)
    let rows: Run[][] = []
    if (world?.yard) {
      paintScene(canvas, { world, scene: (['platformer', 'city', 'camp'] as const)[f % 3] ?? 'camp', hour: 22, frame: f, now: t, weather: null, star: null })
      const floor = world.platforms.find(p => p.id === 'floor')
      const pet = { ...newPet(world), x: world.yard.x0 + (f % 30), platform: 'floor' as const, y: floor?.y ?? 0, act: 'walk' as const }
      drawPet(canvas, pet, world, { mood: at(ms).mood, outfit: 'none', tool: at(ms).tool, isSweating: false, frame: f, needs: { hunger: 0, happiness: 100, energy: 100, bowl: 0, at: t }, reaction: null, isRaining: false, now: t })
    }
    rows = canvas.cells.map(row => runs(row))
    oldTimes.push(performance.now() - t0)
    oldBytes.push(ansiBytes(rows))
  }
  // 0.7: one frame of the room as RGBA, encoded for the terminal.
  const art = artFor(columns)
  const board = { name: 'navazdeen', meters: BARS.map(b => ({ label: b.label, percent: b.percent, tail: b.tail?.replace('resets in ', '') })) }
  const newTimes: number[] = [], newBytes: number[] = []
  for (let f = 0; f < frames; f++) {
    const ms = f * ART_FRAME_MS, t = now + ms
    const t0 = performance.now()
    const encoded = base64(frame(art, { t: (t % 86_400_000) / 1000, now: t, board, look: at(ms), weather: at(ms).mood === 'error' ? 'rain' : 'snow' }))
    newTimes.push(performance.now() - t0)
    newBytes.push(encoded.length)
  }
  return { columns, frames, old: stats(oldTimes, oldBytes, OLD_FRAME_MS), next: stats(newTimes, newBytes, ART_FRAME_MS) }
}

export function formatBench(r: BenchReport): string {
  const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`
  const row = (name: string, p: PathStats) =>
    `${name.padEnd(17)} ${p.medianMs.toFixed(2).padStart(7)} ms ${p.p95Ms.toFixed(2).padStart(7)} ms ${p.maxMs.toFixed(2).padStart(7)} ms ${kb(p.bytesPerFrame).padStart(9)} ${p.fps.toFixed(1).padStart(5)} fps ${kb(p.bytesPerFrame * p.fps).padStart(9)}/s ${((p.medianMs * p.fps) / 10).toFixed(1).padStart(5)}% cpu`
  return [
    `Band benchmark: ${r.columns} columns × 14 rows, ${r.frames} frames each, scripted activity, this runtime.`,
    `${'path'.padEnd(17)} ${'median'.padStart(10)} ${'p95'.padStart(10)} ${'max'.padStart(10)} ${'per frame'.padStart(9)} ${'rate'.padStart(9)} ${'to terminal'.padStart(11)} ${'busy'.padStart(9)}`,
    row('0.6 text band', r.old),
    row('0.7 real pixels', r.next),
  ].join('\n')
}
