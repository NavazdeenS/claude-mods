import { describe, expect, mock, test } from 'claude-code/testing'

import { banner } from './font'
import { forced, isAltDenial } from './graphics'

const BAND = (bodyColumns: number, maxRows: number) =>
  ({ component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows, bodyColumns } }) as const
const NOW = Date.parse('2026-10-23T22:00:00Z')
const run = ($: { command: { run: (i: never) => Promise<{ text?: string }> } }, args: string) =>
  $.command.run({ command: 'pet', args, origin: 'user', presentation: 'text' } as never)

describe('graphics', () => {
  test('only an alt denial turns graphics off', async () => {
    expect(isAltDenial('the Image draws its alt here: the terminal draws neither kitty placeholder images (…) nor iTerm2 inline images (…)')).toBe(true)
    expect(isAltDenial('not mounted')).toBe(false)
    expect(isAltDenial('no-surface')).toBe(false)
    expect(isAltDenial(undefined)).toBe(false)
  })

  test('RETRO_GRAPHICS forces the mode', async () => {
    expect(forced('on')).toBe('yes')
    expect(forced('off')).toBe('no')
    expect(forced(undefined)).toBe(undefined)
    expect(forced('maybe')).toBe(undefined)
  })

  test('forced on renders one Image the band’s size', async ($, on) => {
    mock.env(on, { USER: 'neo', RETRO_GRAPHICS: 'on' })
    mock.clock(on, { now: NOW })
    const ui = await $.ui.mount({ plugin: 'retro-username', surface: 'terminal', ...BAND(160, 20) } as never)
    const img = await ui.find({ type: 'Image', key: 'band' })
    expect(img).toBeDefined()
    expect(img?.props.columns).toBe(160)
    expect(img?.props.rows).toBe(14)
    expect(String(img?.props.alt)).toContain('CONTEXT')
    expect(await ui.find({ type: 'Text', text: banner('neo')[0] ?? '' })).toBeUndefined()
    await ui.unmount()
  })

  test('narrow band stays text', async ($, on) => {
    mock.env(on, { USER: 'neo', RETRO_GRAPHICS: 'on' })
    mock.clock(on, { now: NOW })
    const ui = await $.ui.mount({ plugin: 'retro-username', surface: 'terminal', ...BAND(120, 20) } as never)
    expect(await ui.find({ type: 'Image', key: 'band' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: banner('neo')[0] ?? '' })).toBeDefined()
    await ui.unmount()
  })

  test('scene off stays text', async ($, on) => {
    mock.env(on, { USER: 'neo', RETRO_GRAPHICS: 'on' })
    mock.clock(on, { now: NOW })
    mock.store(on)
    await run($ as never, 'scene off')
    const ui = await $.ui.mount({ plugin: 'retro-username', surface: 'terminal', ...BAND(160, 20) } as never)
    expect(await ui.find({ type: 'Image', key: 'band' })).toBeUndefined()
    await ui.unmount()
  })

  test('probe runs once and keeps the text band', async ($, on) => {
    mock.env(on, { USER: 'neo' })
    mock.clock(on, { now: NOW })
    const ui = await $.ui.mount({ plugin: 'retro-username', surface: 'terminal', ...BAND(160, 20) } as never)
    const probe = await ui.find({ type: 'Image', key: 'probe' })
    expect(probe?.props.columns).toBe(1)
    expect(probe?.props.rows).toBe(1)
    expect(await ui.find({ type: 'Text', text: banner('neo')[0] ?? '' })).toBeDefined()
    expect(await ui.find({ type: 'Image', key: 'band' })).toBeUndefined()
    await ui.unmount()
  })

  test('the desktop surface never gets an Image', async ($, on) => {
    mock.env(on, { USER: 'neo', RETRO_GRAPHICS: 'on' })
    mock.clock(on, { now: NOW })
    const ui = await $.ui.mount({ plugin: 'retro-username', surface: 'desktop', ...BAND(160, 20) } as never)
    expect(await ui.find({ type: 'Image' })).toBeUndefined()
    await ui.unmount()
  })
})
