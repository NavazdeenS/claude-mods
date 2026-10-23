import { describe, expect, mock, test } from 'claude-code/testing'

import { banner } from './font'

const BAND = (bodyColumns: number, maxRows: number) =>
  ({
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows, bodyColumns },
  }) as const

const NOW = Date.parse('2026-10-13T00:00:00Z')

describe('retro-username', () => {
  test('block font spells five aligned rows', async () => {
    const rows = banner('ab')
    expect(rows.length).toBe(5)
    expect(rows[0]).toBe(' █  ██ ')
    expect(new Set(rows.map(r => r.length)).size).toBe(1)
  })

  test('draws the banner, bars and bot when there is room', async ($, on) => {
    mock.env(on, { USER: 'neo' })
    mock.clock(on, { now: NOW })
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'retro-username', surface, ...BAND(160, 20) } as never)
      expect(await ui.find({ type: 'Text', text: banner('neo')[0] ?? '' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /CONTEXT/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /SESSION/ })).toBeDefined()
      await ui.unmount()
    }
  })

  test('falls back to one bold line with a face in a cramped band', async ($, on) => {
    mock.env(on, { USER: 'neo' })
    mock.clock(on, { now: NOW })
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'retro-username', surface, ...BAND(10, 3) } as never)
      expect(await ui.find({ type: 'Text', text: /NEO/ })).toBeDefined()
      await ui.unmount()
    }
  })

  test('bars follow measured usage', async ($, on) => {
    mock.env(on, { USER: 'neo' })
    mock.clock(on, { now: NOW })
    on('session.measure', async (_$, e) => ({ changed: e.changed }))
    await $.session.measure({
      context: { percent: 85, tokens: 170_000, window: 200_000 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 30, resetsAt: '2026-10-13T02:30:00Z' },
        { kind: 'seven_day', percentUsed: 42, resetsAt: '2026-10-16T04:00:00Z' },
      ],
      changed: ['context', 'rateLimits'],
    } as never)
    const ui = await $.ui.mount({ plugin: 'retro-username', surface: 'terminal', ...BAND(160, 20) } as never)
    expect(await ui.find({ type: 'Text', text: /170k\/200k/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /2h 30m/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /3d 4h/ })).toBeDefined()
    await ui.unmount()
  })
})

test('after the session starts, the roomy band paints the retro scene', async ($, on) => {
  mock.env(on, { USER: 'neo' })
  mock.clock(on, { now: NOW })
  mock.store(on)
  on('session.usage', async () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] } }) as never)
  on('session.start', async () => ({ cwd: '/tmp' }) as never)
  on('command.register', async () => ({ value: undefined }) as never)
  await $.session.start({ cwd: '/tmp', surface: 'terminal' } as never)
  const ui = await $.ui.mount({ plugin: 'retro-username', surface: 'terminal', ...BAND(160, 20) } as never)
  const texts = await ui.findAll({ type: 'Text' })
  expect(texts.some(t => typeof t.props.backgroundColor === 'string')).toBe(true)
  await ui.unmount()
})
