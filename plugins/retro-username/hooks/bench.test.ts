import { describe, expect, mock, test } from 'claude-code/testing'

import { ansiBytes, bench, formatBench } from './bench'

const NOW = Date.parse('2026-10-23T22:41:00')

describe('bench', () => {
  test('report has finite numbers for both paths', async () => {
    const r = bench(150, 12, NOW)
    expect(r.columns).toBe(150)
    expect(r.frames).toBe(12)
    for (const p of [r.old, r.next]) {
      for (const v of [p.medianMs, p.p95Ms, p.maxMs, p.bytesPerFrame, p.fps]) expect(Number.isFinite(v)).toBe(true)
      expect(p.medianMs).toBeGreaterThan(0)
      expect(p.p95Ms).toBeGreaterThanOrEqual(p.medianMs)
      expect(p.maxMs).toBeGreaterThanOrEqual(p.p95Ms)
    }
    expect(Math.abs(r.old.fps - 1000 / 300)).toBeLessThan(1e-9)
    expect(r.next.fps).toBe(8)
  })

  test('image bytes equal base64 of the frame', async () => {
    expect(bench(150, 3, NOW).next.bytesPerFrame).toBe(4 * Math.ceil((450 * 84 * 4) / 3))
  })

  test('ansiBytes counts SGR and text', async () => {
    const rows = [[{ text: 'ab', style: {} }, { text: '█', style: { fg: '#ffffff' } }]]
    expect(ansiBytes(rows)).toBe(19 + 2 + 19 + 3 + 2)
  })

  test('the table names both paths', async () => {
    const text = formatBench(bench(150, 3, NOW))
    expect(text).toContain('0.6 text band')
    expect(text).toContain('0.7 real pixels')
    expect(text).toContain('ms')
  })
})

test('/pet bench prints the table', async ($, on) => {
  mock.clock(on, { now: NOW })
  mock.store(on)
  const r = (await ($ as never as { command: { run: (i: never) => Promise<{ text?: string }> } }).command.run({ command: 'pet', args: 'bench 6', origin: 'user', presentation: 'text' } as never)).text ?? ''
  expect(r).toContain('0.6 text band')
  expect(r).toContain('0.7 real pixels')
  expect(r).toContain('6 frames')
})
