import { describe, expect, mock, test } from 'claude-code/testing'

const BAND = (bodyColumns: number, maxRows: number, hasSurvey = false) =>
  ({ component: 'AbovePrompt', props: { hasSurvey, isWorking: false, maxRows, bodyColumns } }) as const
const NOW = Date.parse('2026-10-23T22:00:00Z')
const ALT = 'the Image draws its alt here: the terminal draws neither kitty placeholder images (…) nor iTerm2 inline images (…)'

// Starts a session the way the engine does, with a stubbed blit that records each call.
async function start($: never, on: never, env: Record<string, string>, answer: (key: string) => Promise<{ deny?: string }>) {
  const m = mock as never as { env: Function; clock: Function; store: Function }
  m.env(on, { USER: 'neo', ...env })
  const clock = m.clock(on, { now: NOW }) as { advance: (ms: number) => Promise<void> }
  m.store(on)
  const o = on as never as (ev: string, fn: Function) => void
  o('session.usage', async () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] } }))
  o('session.start', async () => ({ cwd: '/tmp' }))
  o('command.register', async () => ({ value: undefined }))
  const keys: string[] = []
  o('ui.blit', async (_$: unknown, e: { key: string }) => {
    keys.push(e.key)
    return { value: await answer(e.key) }
  })
  // What the engine draws when a hook passes the band on (a survey holding it).
  // biome-ignore lint: the element table's types do not matter to this stub
  o('ui.render', async (r: { ui: { resolve: (e: unknown) => any } }, e: unknown) => {
    const { Text } = r.ui.resolve(e)
    return <Text>survey</Text>
  })
  const $$ = $ as never as { session: { start: (i: never) => Promise<unknown> }; ui: { mount: (i: never) => Promise<{ find: Function; unmount: () => Promise<void> }> } }
  await $$.session.start({ cwd: '/tmp', surface: 'terminal' } as never)
  return { clock, keys, mount: (cols: number, rows: number, survey = false) => $$.ui.mount({ plugin: 'retro-username', surface: 'terminal', ...BAND(cols, rows, survey) } as never) }
}

describe('art beat', () => {
  test('a taken probe turns the band into the Image', async ($, on) => {
    const s = await start($ as never, on as never, {}, async () => ({}))
    const ui = await s.mount(160, 20)
    expect(await ui.find({ type: 'Image', key: 'probe' })).toBeDefined()
    await s.clock.advance(125)
    expect(s.keys[0]).toBe('probe')
    const again = await s.mount(160, 20)
    expect(await again.find({ type: 'Image', key: 'band' })).toBeDefined()
    await again.unmount()
    await ui.unmount()
  })

  test('an alt denial keeps the text band and probes once', async ($, on) => {
    const s = await start($ as never, on as never, {}, async () => ({ deny: ALT }))
    const ui = await s.mount(160, 20)
    for (let i = 0; i < 6; i++) await s.clock.advance(125)
    expect(s.keys.filter(k => k === 'probe').length).toBe(1)
    const again = await s.mount(160, 20)
    expect(await again.find({ type: 'Image' })).toBeUndefined()
    await again.unmount()
    await ui.unmount()
  })

  test('a not-mounted denial keeps graphics undecided', async ($, on) => {
    const s = await start($ as never, on as never, {}, async () => ({ deny: 'nothing of this plugin is mounted there' }))
    const ui = await s.mount(160, 20)
    for (let i = 0; i < 3; i++) await s.clock.advance(125)
    const again = await s.mount(160, 20)
    expect(await again.find({ type: 'Image', key: 'probe' })).toBeDefined()
    expect(await again.find({ type: 'Image', key: 'band' })).toBeUndefined()
    await again.unmount()
    await ui.unmount()
  })

  test('a survey stops the art beat', async ($, on) => {
    const s = await start($ as never, on as never, { RETRO_GRAPHICS: 'on' }, async () => ({}))
    const ui = await s.mount(160, 20)
    for (let i = 0; i < 4; i++) await s.clock.advance(125)
    const before = s.keys.filter(k => k === 'band').length
    expect(before).toBeGreaterThan(0)
    const survey = await s.mount(160, 20, true)
    for (let i = 0; i < 8; i++) await s.clock.advance(125)
    expect(s.keys.filter(k => k === 'band').length).toBe(before)
    await survey.unmount()
    await ui.unmount()
  })

  test('a stalled blit is not stacked', async ($, on) => {
    const s = await start($ as never, on as never, { RETRO_GRAPHICS: 'on' }, () => new Promise(() => {}))
    const ui = await s.mount(160, 20)
    for (let i = 0; i < 8; i++) await s.clock.advance(125)
    expect(s.keys.filter(k => k === 'band').length).toBe(1)
    await ui.unmount()
  })

  test('terminals wider than an Image can hold stay text', async ($, on) => {
    const s = await start($ as never, on as never, { RETRO_GRAPHICS: 'on' }, async () => ({}))
    const ui = await s.mount(300, 20)
    expect(await ui.find({ type: 'Image', key: 'band' })).toBeUndefined()
    await ui.unmount()
  })
})
