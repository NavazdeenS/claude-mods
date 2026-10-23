import { expect, test } from 'claude-code/testing'

import { blank, write } from './canvas'
import { blit, pixels, rect, set } from './pixel'

test('two pixel rows make one cell row', async () => {
  const p = pixels(4, 2)
  set(p, 0, 0, '#aaaaaa')
  set(p, 0, 1, '#bbbbbb')
  rect(p, 1, 0, 1, 1, '#cccccc')
  set(p, 2, 1, '#dddddd')
  const c = blank(5, 1)
  blit(c, p, 1, 0)
  expect(c.cells[0]?.[1]).toEqual({ ch: '▀', style: { fg: '#aaaaaa', bg: '#bbbbbb' } })
  expect(c.cells[0]?.[2]).toEqual({ ch: ' ', style: { bg: '#cccccc' } })
  expect(c.cells[0]?.[3]).toEqual({ ch: '▄', style: { fg: '#dddddd' } })
  expect(c.cells[0]?.[4]).toEqual({ ch: ' ', style: {} })
  expect(c.cells[0]?.[0]).toEqual({ ch: ' ', style: {} })
})

test('a cell that holds something keeps it and takes the lower pixel as its background', async () => {
  const p = pixels(1, 2)
  set(p, 0, 0, '#111111')
  set(p, 0, 1, '#222222')
  const c = blank(1, 1)
  write(c, 0, 0, '●', { fg: '#00e5ff' })
  blit(c, p, 0, 0)
  expect(c.cells[0]?.[0]).toEqual({ ch: '●', style: { fg: '#00e5ff', bg: '#222222' } })
})

test('pixels off the grid are ignored', async () => {
  const p = pixels(2, 2)
  set(p, -1, 0, '#ffffff')
  set(p, 5, 9, '#ffffff')
  rect(p, -3, -3, 9, 9, '#123456')
  expect(p.px.every(v => v === '#123456')).toBe(true)
})
