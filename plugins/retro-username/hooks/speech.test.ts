import { expect, test } from 'claude-code/testing'

import type { Pet } from '../types'
import { blank, rowText } from './canvas'
import { BUBBLE_GAP_MS, BUBBLE_MS, LINES, drawBubble, say } from './speech'

const NOW = Date.parse('2026-10-13T12:00:00Z')

test('one bubble a minute, picked from the pool', async () => {
  const first = say(0, 'commit', NOW, 0)
  expect(first?.bubble).toEqual({ text: 'ship it!', until: NOW + BUBBLE_MS })
  expect(say(NOW, 'commit', NOW + BUBBLE_GAP_MS - 1, 0)).toBeNull()
  expect(say(NOW, 'commit', NOW + BUBBLE_GAP_MS, 0.99)?.bubble.text).toBe('nice commit')
})

test('errors and resets skip the wait; silent signals say nothing', async () => {
  expect(say(NOW, 'turn-error', NOW + 1, 0)?.bubble.text).toBe('ouch')
  expect(say(NOW, 'bar-reset-weekly', NOW + 1, 0)?.bubble.text).toBe('fresh week!')
  expect(say(0, 'typing', NOW, 0)).toBeNull()
  expect(LINES['turn-ok']).toBeUndefined()
})

test('the bubble sits beside the head and stays on the band', async () => {
  const pet: Pet = { x: 2, y: 9, platform: 'ledge', facing: 1, act: 'stand', t: 0, seed: 1 }
  const c = blank(30, 5)
  drawBubble(c, pet, { text: 'hi', until: NOW + 1 }, NOW)
  expect(rowText(c, 1)).toBe('        ‹ hi ›                ')
  const edge = blank(30, 5)
  drawBubble(edge, { ...pet, x: 26 }, { text: 'hello there', until: NOW + 1 }, NOW)
  expect(rowText(edge, 1).trimEnd().endsWith('›')).toBe(true)
  expect(rowText(edge, 1).length).toBe(30)
  const gone = blank(30, 5)
  drawBubble(gone, pet, { text: 'hi', until: NOW }, NOW)
  expect(rowText(gone, 1).trim()).toBe('')
})
