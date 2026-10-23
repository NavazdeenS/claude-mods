import { describe, expect, test } from 'claude-code/testing'

import { type FrameInput, altText, artEvery, artFor, frame } from './art'

const NOW = Date.parse('2026-10-23T22:41:00')
const board = {
  name: 'navazdeen',
  meters: [
    { label: 'CONTEXT', percent: 42, tail: '84k/200k' },
    { label: 'SESSION', percent: 73, tail: '2h 10m' },
    { label: 'WEEKLY', percent: 18, tail: '4d 3h' },
  ],
}
const input = (t: number): FrameInput => ({ t, now: NOW + t * 1000, board, look: { mood: 'working', tool: 'Edit' }, weather: 'snow' })

// Mean colour of the approved mockup docs/assets/2026-10-23-cozy-room/claude-back-band.png.
const MOCKUP_MEAN = [54.6, 41.4, 33.5]

describe('art', () => {
  test('size follows the band', async () => {
    const art = artFor(150)
    expect(art.w).toBe(450)
    expect(art.h).toBe(84)
    expect(frame(art, input(1)).length).toBe(450 * 84 * 4)
  })

  test('frames are deterministic', async () => {
    const a = artFor(150)
    const one = frame(a, input(2.5)).slice()
    const two = frame(a, input(2.5)).slice()
    expect(one).toEqual(two)
  })

  test('static work happens once per size', async () => {
    const a = artFor(151)
    for (let i = 0; i < 40; i++) frame(a, input(i / 8))
    expect(a.stats.staticBuilds).toBe(1)
    const b = artFor(152)
    frame(b, input(0))
    expect(artFor(151)).toBe(a)
    expect(b.stats.staticBuilds).toBe(1)
  })

  test('matches the approved look', async () => {
    const rgba = frame(artFor(150), input(9.5))
    const sum = [0, 0, 0]
    for (let i = 0; i < rgba.length; i += 4) for (let c = 0; c < 3; c++) sum[c] = (sum[c] as number) + (rgba[i + c] as number)
    const n = rgba.length / 4
    sum.forEach((v, c) => expect(Math.abs(v / n - (MOCKUP_MEAN[c] as number))).toBeLessThan(12))
  })

  test('fast enough', async () => {
    const a = artFor(150)
    const times: number[] = []
    for (let i = 0; i < 40; i++) {
      const t0 = performance.now()
      frame(a, input(i / 8))
      times.push(performance.now() - t0)
    }
    times.sort((x, y) => x - y)
    expect(times[20] as number).toBeLessThan(20)
  })

  test('alt text reads the board', async () => {
    expect(altText(board)).toBe('NAVAZDEEN · CONTEXT 42% · SESSION 73% · WEEKLY 18%')
    expect(altText({ name: 'neo', meters: [{ label: 'CONTEXT' }] })).toBe('NEO · CONTEXT --')
  })

  test('frame rate follows what Claude is doing', async () => {
    expect(artEvery('working')).toBe(1)
    expect(artEvery('thinking')).toBe(1)
    expect(artEvery('idle')).toBe(2)
    expect(artEvery('happy')).toBe(2)
    expect(artEvery('error')).toBe(2)
    expect(artEvery('sleeping')).toBe(8)
  })

  test('over SSH every rate halves', async () => {
    expect(artEvery('working', true)).toBe(2)
    expect(artEvery('idle', true)).toBe(4)
    expect(artEvery('sleeping', true)).toBe(16)
  })
})
