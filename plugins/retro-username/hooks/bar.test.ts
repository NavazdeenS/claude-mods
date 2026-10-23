import { expect, test } from 'claude-code/testing'

import { barCells, barColor, resetsIn } from './bar'

test('bar fills in proportion and clamps', async () => {
  expect(barCells(50, 10)).toEqual({ filled: '█████', empty: '░░░░░' })
  expect(barCells(130, 4).filled).toBe('████')
  expect(barCells(-5, 4).empty).toBe('░░░░')
})

test('colour steps at 70 and 90', async () => {
  expect(barColor(10)).toBe('#39ff14')
  expect(barColor(75)).toBe('#ffa640')
  expect(barColor(95)).toBe('#ff3860')
})

test('countdown to reset', async () => {
  const now = Date.parse('2026-10-13T00:00:00Z')
  expect(resetsIn({ percentUsed: 1, resetsAt: '2026-10-16T04:00:00Z' }, now)).toBe('3d 4h')
  expect(resetsIn({ percentUsed: 1, resetsAt: '2026-10-13T05:12:00Z' }, now)).toBe('5h 12m')
  expect(resetsIn({ percentUsed: 1 }, now)).toBeUndefined()
})
