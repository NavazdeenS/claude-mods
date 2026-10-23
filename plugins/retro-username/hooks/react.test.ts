import { expect, test } from 'claude-code/testing'

import { RAIN_MS, RAINBOW_MS, applySignal } from './react'
import { emptyScene } from './state'

const NOW = Date.parse('2026-10-13T12:00:00Z')

test('typing looks down; a long draft widens the eyes and typing does not undo it', async () => {
  let s = applySignal(emptyScene(1), { signal: 'typing' }, NOW)
  expect(s.reaction).toEqual({ kind: 'look-down', until: NOW + 3000, cells: undefined })
  s = applySignal(s, { signal: 'typing-long' }, NOW + 10)
  expect(s.reaction?.kind).toBe('wide-eyes')
  s = applySignal(s, { signal: 'typing' }, NOW + 20)
  expect(s.reaction?.kind).toBe('wide-eyes')
  expect(applySignal(s, { signal: 'typing' }, NOW + 4000).reaction?.kind).toBe('look-down')
})

test('a bar reaction is not interrupted by typing', async () => {
  let s = applySignal(emptyScene(1), { signal: 'bar-red', bar: 0, cells: 22 }, NOW)
  expect(s.reaction).toEqual({ kind: 'pace', until: NOW + 10_000, cells: 22 })
  s = applySignal(s, { signal: 'typing' }, NOW + 100)
  expect(s.reaction?.kind).toBe('pace')
})

test('an error rains and speaks at once; the next good turn brings a rainbow', async () => {
  let s = applySignal(emptyScene(1), { signal: 'commit' }, NOW)
  expect(s.bubble?.text).toBeDefined()
  s = applySignal(s, { signal: 'turn-error' }, NOW + 1000)
  expect(s.weather).toEqual({ kind: 'rain', until: NOW + 1000 + RAIN_MS })
  expect(['ouch', 'that hurt']).toContain(s.bubble?.text)
  s = applySignal(s, { signal: 'turn-ok' }, NOW + 20_000)
  expect(s.weather).toEqual({ kind: 'rainbow', until: NOW + 20_000 + RAINBOW_MS })
  expect(applySignal(s, { signal: 'turn-ok' }, NOW + 30_000).weather?.kind).toBe('rainbow')
  expect(applySignal(emptyScene(1), { signal: 'turn-ok' }, NOW).weather).toBeNull()
})

test('confetti after a long task; resets name their bar; bubbles wait a minute', async () => {
  expect(applySignal(emptyScene(1), { signal: 'long-task-done' }, NOW).happenings.confettiUntil).toBe(NOW + 4000)
  expect(applySignal(emptyScene(1), { signal: 'bar-reset', bar: 2 }, NOW).bubble?.text).toBe('fresh week!')
  expect(applySignal(emptyScene(1), { signal: 'bar-reset', bar: 1 }, NOW).bubble?.text).toBe('new session!')
  const once = applySignal(emptyScene(1), { signal: 'commit' }, NOW)
  const twice = applySignal(once, { signal: 'tests-passed' }, NOW + 5000)
  expect(twice.bubble).toEqual(once.bubble)
})
