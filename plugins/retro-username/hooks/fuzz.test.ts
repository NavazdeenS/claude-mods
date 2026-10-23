import { expect, test } from 'claude-code/testing'

import type { Mood, Pet } from '../types'
import { drawHappenings, moveButterfly, spawnButterfly } from './happenings'
import { type Bar, layout } from './layout'
import { fresh } from './needs'
import { drawPet, newPet, step } from './pet'
import { rand } from './rand'
import { applySignal } from './react'
import { SCENES, paintScene } from './scene'
import type { Signal } from './signals'
import { drawBubble } from './speech'
import { emptyScene } from './state'

const NOW = Date.parse('2026-10-13T12:00:00Z')
const BARS: Bar[] = [{ label: 'CONTEXT', percent: 91, tail: '182k/200k' }, { label: 'SESSION', percent: 30 }, { label: 'WEEKLY', percent: 75 }]
const MOODS: Mood[] = ['idle', 'thinking', 'working', 'happy', 'error', 'sleeping']
const SIGNALS: Signal[] = ['typing', 'typing-long', 'typing-paused', 'typing-cleared', 'commit', 'tests-passed', 'tests-failed', 'grep-streak', 'turn-error', 'turn-ok', 'long-task-done', 'bar-red', 'bar-moved', 'bar-reset', 'hungry', 'going-to-eat']

test('1,000 frames of anything, with resizes, never break the band', async () => {
  let scene = emptyScene(99)
  let pet: Pet | null = null
  let seed = 12345
  const needs = { ...fresh(0), hunger: 70, bowl: 1 }
  const broken: number[] = []
  const yards = new Set<boolean>()
  for (let f = 0; f < 1000; f++) {
    const w = f % 600 < 300 ? 120 : 58
    const { canvas, world } = layout('neo', BARS, w, true)
    const now = NOW + f * 300
    yards.add(world!.yard !== undefined)
    const [r, s1] = rand(seed)
    const [r2, s2] = rand(s1)
    seed = s2
    const mood = MOODS[Math.floor(r * MOODS.length)] ?? 'idle'
    if (r2 < 0.15) {
      const signal = SIGNALS[Math.floor(r2 * 100) % SIGNALS.length] ?? 'typing'
      scene = applySignal(scene, { signal, bar: (f % 3) as 0 | 1 | 2, cells: f % 25 }, now)
    }
    let butterfly = f % 200 === 0 ? spawnButterfly(now, f) : scene.happenings.butterfly
    butterfly = moveButterfly(butterfly, world!, now)
    scene = { ...scene, happenings: { ...scene.happenings, butterfly } }
    pet = step(pet ?? newPet(world!), { world: world!, mood, needs, now, reaction: scene.reaction, butterfly, hasGift: f % 2 === 0, campfire: f % 3 === 0 && world!.yard ? world!.yard.x0 + 5 : null }).pet
    paintScene(canvas, { world: world!, scene: SCENES[f % 3] ?? 'camp', hour: (f / 50) % 24, frame: f, now, weather: scene.weather, star: f % 300 < 5 ? { x: 3, at: now - 100 } : null })
    drawHappenings(canvas, scene.happenings, f, now)
    drawPet(canvas, pet, world!, { mood, outfit: f % 2 === 0 ? 'wizard' : 'hardhat', tool: 'Grep', isSweating: true, frame: f, needs, reaction: scene.reaction, isRaining: scene.weather?.kind === 'rain', now })
    drawBubble(canvas, pet, scene.bubble, now)
    const isWhole = canvas.cells.length === world!.h && canvas.cells.every(row => row.length === w && row.every(cell => [...cell.ch].length === 1))
    if (!isWhole) broken.push(f)
  }
  expect(broken).toEqual([])
  expect([...yards].sort()).toEqual([false, true])
})
