import { expect, mock, test } from 'claude-code/testing'

const run = ($: { command: { run: (i: never) => Promise<{ text?: string }> } }, args: string) =>
  $.command.run({ command: 'pet', args, origin: 'user', presentation: 'text' } as never)

test('/pet names, feeds and dresses the pet, and keeps it in the store', async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-10-13T12:00:00Z') })
  mock.store(on)
  expect((await run($ as never, 'name Bit')).text).toContain('Bit')
  expect((await run($ as never, 'feed')).text).toContain("Bit's bowl")
  expect((await run($ as never, 'wear party')).text).toContain('party')
  expect((await run($ as never, 'wear tuxedo')).text).toContain('Outfits:')
  const stats = (await run($ as never, '')).text ?? ''
  expect(stats).toContain('Bit — mochi — outfit: party')
  expect(stats).toContain('bowl 2/3')
})

test('/pet scene toggles the scene; /pet open without a gift says so', async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-10-13T12:00:00Z') })
  mock.store(on)
  expect((await run($ as never, 'scene off')).text).toBe('Retro scene off.')
  expect((await run($ as never, 'scene sideways')).text).toBe('Usage: /pet scene auto|off|platformer|city|camp')
  expect((await run($ as never, 'scene camp')).text).toBe('Scene: camp.')
  expect((await run($ as never, 'open')).text).toContain('No gift')
  expect((await run($ as never, 'wear crown')).text).toContain('Outfits:')
  expect((await run($ as never, '')).text).toContain('/pet open')
})
