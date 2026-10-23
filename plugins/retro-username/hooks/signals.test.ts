import { describe, expect, test } from 'claude-code/testing'

import { type SignalEvent, enqueue, fromBars, fromBash, fromEdit, fromTurn, grepStreak, hungerCheck, pauseCheck } from './signals'

const NOW = Date.parse('2026-10-13T12:00:00Z')

describe('fromBash', () => {
  test('commits', async () => {
    expect(fromBash('git commit -m "x"', false)).toEqual(['commit'])
    expect(fromBash('git add . && git commit -m x', false)).toEqual(['commit'])
    expect(fromBash('git -C repo commit -m x', false)).toEqual(['commit'])
    expect(fromBash('git commit -m x', true)).toEqual([])
    expect(fromBash('echo "git commit"', false)).toEqual([])
    expect(fromBash('git commitx', false)).toEqual([])
  })

  test('test runners pass or fail with the call', async () => {
    expect(fromBash('npm test', false)).toEqual(['tests-passed'])
    expect(fromBash('cd app && npm run test -- --watch=false', false)).toEqual(['tests-passed'])
    expect(fromBash('pytest -q', true)).toEqual(['tests-failed'])
    expect(fromBash('python3 -m pytest', false)).toEqual(['tests-passed'])
    expect(fromBash('go test ./...', false)).toEqual(['tests-passed'])
    expect(fromBash('cargo test', false)).toEqual(['tests-passed'])
    expect(fromBash('npx vitest run', false)).toEqual(['tests-passed'])
    expect(fromBash('claude plugin test .', false)).toEqual(['tests-passed'])
    expect(fromBash('npm testing', false)).toEqual([])
    expect(fromBash('ls tests', false)).toEqual([])
  })
})

test('a grep streak fires once at five', async () => {
  let run = 0
  const fired: boolean[] = []
  for (const tool of ['Grep', 'Glob', 'Grep', 'Grep', 'Grep', 'Grep', 'Read', 'Grep']) {
    const r = grepStreak(run, tool)
    run = r.run
    fired.push(r.fire)
  }
  expect(fired).toEqual([false, false, false, false, true, false, false, false])
})

test('turns', async () => {
  expect(fromTurn('answer', 1000)).toEqual(['turn-ok'])
  expect(fromTurn('answer', 121_000)).toEqual(['turn-ok', 'long-task-done'])
  expect(fromTurn('error', 0)).toEqual(['turn-error'])
  expect(fromTurn('refusal', 0)).toEqual(['turn-error'])
  expect(fromTurn('aborted', 0)).toEqual([])
})

test('bars', async () => {
  expect(fromBars([80, 10, 10], [91, 10, 10])).toEqual([{ signal: 'bar-red', bar: 0 }])
  expect(fromBars([10, 10, 10], [10, 16, 10])).toEqual([{ signal: 'bar-moved', bar: 1 }])
  expect(fromBars([10, 10, 80], [10, 10, 3])).toEqual([{ signal: 'bar-reset', bar: 2 }])
  expect(fromBars([80, 10, 10], [50, 10, 10])).toEqual([])
  expect(fromBars([undefined, 10, 10], [95, 10, 10])).toEqual([])
  expect(fromBars([91, 10, 10], [95, 10, 10])).toEqual([])
})

describe('typing', () => {
  test('edits, long drafts once, clearing', async () => {
    const a = fromEdit(null, 'hi', NOW)
    expect(a.signals).toEqual(['typing'])
    const b = fromEdit(a.typing, 'x'.repeat(501), NOW + 10)
    expect(b.signals).toEqual(['typing', 'typing-long'])
    const c = fromEdit(b.typing, 'x'.repeat(502), NOW + 20)
    expect(c.signals).toEqual(['typing'])
    const d = fromEdit(c.typing, '', NOW + 30)
    expect(d).toEqual({ typing: null, signals: ['typing-cleared'] })
    expect(fromEdit(null, '', NOW).signals).toEqual([])
  })

  test('a pause fires once after 20 s', async () => {
    const t = fromEdit(null, 'draft', NOW).typing
    expect(pauseCheck(t, NOW + 19_999).fire).toBe(false)
    const p = pauseCheck(t, NOW + 20_000)
    expect(p.fire).toBe(true)
    expect(pauseCheck(p.typing, NOW + 40_000).fire).toBe(false)
    expect(pauseCheck(null, NOW).fire).toBe(false)
  })
})

test('hunger nags once after ten minutes', async () => {
  let m = { hungrySince: 0, hasSaidHungry: false }
  const at = (dt: number, isHungry: boolean) => {
    const r = hungerCheck(m, isHungry, NOW + dt)
    m = { hungrySince: r.hungrySince, hasSaidHungry: r.hasSaidHungry }
    return r.fire
  }
  expect(at(0, true)).toBe(false)
  expect(at(599_999, true)).toBe(false)
  expect(at(600_000, true)).toBe(true)
  expect(at(700_000, true)).toBe(false)
  expect(at(800_000, false)).toBe(false)
  expect(m).toEqual({ hungrySince: 0, hasSaidHungry: false })
})

test('the queue keeps one typing and at most 50 events', async () => {
  let q: SignalEvent[] = []
  for (let i = 0; i < 300; i++) q = enqueue(q, { signal: 'typing' })
  expect(q).toEqual([{ signal: 'typing' }])
  for (let i = 0; i < 80; i++) q = enqueue(q, { signal: 'commit' })
  expect(q.length).toBe(50)
  expect(q[q.length - 1]).toEqual({ signal: 'commit' })
})

test('only an exit status that belongs to the command counts', async () => {
  expect(fromBash('claude plugin test . 2>&1 | tail -4', false)).toEqual([])
  expect(fromBash('npm test; echo done', false)).toEqual([])
  expect(fromBash('git commit -m x || true', false)).toEqual([])
  expect(fromBash('npm test && echo ok', false)).toEqual(['tests-passed'])
  expect(fromBash('cd app\nnpm test', true)).toEqual(['tests-failed'])
})
