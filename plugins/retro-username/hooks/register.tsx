import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage, SessionRateLimit } from 'claude-code'

import type { Care, ContextFill, Meter, Mood, Scene, SceneChoice, Usage } from '../types'
import { ART_FRAME_MS, ART_ROWS, MAX_COLUMNS, MIN_COLUMNS, altText, artEvery, artFor, base64, frame } from './art'
import { barCells, resetsIn } from './bar'
import { bench, formatBench } from './bench'
import { type BoardData, contextTail } from './board'
import { botFace } from './bot'
import { expireDayOutfit, loadCare, localDay, mergeCare, wearable } from './care'
import { type Canvas, runs, write } from './canvas'
import { ROLL_EVERY, drawGift, drawHappenings, landGift, moveButterfly, openGift, roll, spawnButterfly } from './happenings'
import { type Bar, type World, GRADIENT, ROOMY_ROWS, SNUG_ROWS, contentWidth, drawBowl, drawFloor, layout } from './layout'
import { eat, feed, isHungry, play, settle, work } from './needs'
import { type Outfit, doing, drawPet, newPet, outfitFor, step } from './pet'
import { rand } from './rand'
import { type Graphics, PROBE_SOURCE, forced, isAltDenial } from './graphics'
import { applySignal } from './react'
import { SCENE_CHOICES, campfireX, paintScene, phase, sceneFor } from './scene'
import { type SignalEvent, type Typing, enqueue, fromBars, fromBash, fromEdit, fromTurn, grepStreak, hungerCheck, pauseCheck } from './signals'
import { drawBubble } from './speech'
import { BODIES, DEFAULT_STYLE, PET_STYLES, type PetStyle } from './sprites'
import { emptyScene, normalizeScene } from './state'

const FRAME_MS = 300
const SETTLE_MS = 4000
const SLEEP_MS = 5 * 60_000
const SAVE_EVERY = 100
const SWEAT_AT = 80
const CHILL_UNDER = 30
const STORE_KEY = 'pet'

const usage = atom({ plugin: 'retro-username', key: 'usage' } as const, {
  context: null,
  session: null,
  weekly: null,
})
const bot = atom({ plugin: 'retro-username', key: 'bot' } as const, { mood: 'idle', since: 0 })
const scene = atom({ plugin: 'retro-username', key: 'scene' } as const, emptyScene(7))
const account = atom({ plugin: 'retro-username', key: 'name' } as const, null)
const care = atom({ plugin: 'retro-username', key: 'care' } as const, null)

const meter = (limits: readonly SessionRateLimit[], kind: string): Meter | null => {
  const w = limits.find(l => l.kind === kind)
  return w ? { percentUsed: w.percentUsed, resetsAt: w.resetsAt } : null
}

const fill = (context: SessionContextUsage): ContextFill | null =>
  context.percent === undefined
    ? null
    : { percent: context.percent, tokens: context.tokens, window: context.window }

const toUsage = (context: SessionContextUsage, limits: readonly SessionRateLimit[]): Usage => ({
  context: fill(context),
  session: meter(limits, 'five_hour'),
  weekly: meter(limits, 'seven_day'),
})

const percents = (u: Usage) => [u.context?.percent, u.session?.percentUsed, u.weekly?.percentUsed]
const kTokens = (n: number): string => (n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`)
const hourOf = (t: number) => {
  const d = new Date(t)
  return d.getHours() + d.getMinutes() / 60
}

/** Runs one feature's work for a frame; a failure leaves its part as it was. */
function guard<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
}

// Module state: the world the band last drew, the draft being typed, and
// signals waiting for the next beat (so typing never writes state per key).
let lastWorld: World | undefined
let typing: Typing | null = null
let pending: SignalEvent[] = []
let grepRun = 0
let turnStart = 0

// The real-pixel band: whether the terminal draws pixels, where the band and
// the probe were last drawn, and what Claude and the weather were at the last
// beat (read here, not while drawing, so the 300 ms beat does not redraw the Image).
let graphics: Graphics = 'unknown'
let forcedGraphics: Graphics | undefined
let bandRequest: string | undefined
let bandColumns = MIN_COLUMNS
let probeRequest: string | undefined
let isProbing = false
let isBlitting = false
let refusedInARow = 0
let artTick = 0
let isRemote = false
let lastLook: { mood: Mood; tool?: string } = { mood: 'idle' }
let lastWeather: 'snow' | 'rain' = 'snow'

/** Animation time in seconds, kept small so it stays precise. */
const artTime = (now: number) => (now % 86_400_000) / 1000

async function bandName($: EngineInterface): Promise<string> {
  return (await read($, account)) ?? (await $.env.get('USER')) ?? (await $.env.get('USERNAME')) ?? 'player 1'
}

/** The chalkboard's name and meters: percent and a short tail, no "resets in". */
function boardFor(name: string, use: Usage, now: number): BoardData {
  const ctx = use.context
  const left = (m: Meter | null) => (m ? resetsIn(m, now) : undefined)
  return {
    name,
    meters: [
      { label: 'CONTEXT', percent: ctx?.percent, tail: ctx?.tokens ? contextTail(ctx.tokens, ctx.window) : undefined },
      { label: 'SESSION', percent: use.session?.percentUsed, tail: left(use.session) },
      { label: 'WEEKLY', percent: use.weekly?.percentUsed, tail: left(use.weekly) },
    ],
  }
}

/** One art frame: probe the terminal first, then animate the band's Image. */
async function artBeat($: EngineInterface): Promise<void> {
  const mode = forcedGraphics ?? graphics
  if (mode === 'unknown') {
    if (!probeRequest || isProbing) return
    isProbing = true
    try {
      const r = await $.ui.blit({ requestId: probeRequest, key: 'probe', source: PROBE_SOURCE })
      if (r.deny === undefined) graphics = 'yes'
      else if (isAltDenial(r.deny)) graphics = 'no'
      if (graphics !== 'unknown') {
        probeRequest = undefined
        $.ui.invalidate('ui.render')
      }
    } finally {
      isProbing = false
    }
    return
  }
  if (mode !== 'yes' || !bandRequest || isBlitting) return
  const b = await read($, bot)
  artTick = (artTick + 1) % 1_000_000
  if (artTick % artEvery(b.mood, isRemote) !== 0) return
  const now = await $.clock.now()
  const s = normalizeScene(await read($, scene))
  lastLook = { mood: b.mood, tool: b.tool }
  lastWeather = s.weather?.kind === 'rain' && now < s.weather.until ? 'rain' : 'snow'
  const art = artFor(bandColumns)
  const rgba = frame(art, { t: artTime(now), now, board: boardFor(await bandName($), await read($, usage), now), look: lastLook, weather: lastWeather })
  // One band blit at a time: a stalled terminal (SSH backpressure) skips beats instead of stacking frames.
  isBlitting = true
  try {
    const r = await $.ui.blit({ requestId: bandRequest, key: 'band', source: { rgba: base64(rgba), width: art.w, height: art.h } })
    refusedInARow = r.deny === undefined ? 0 : refusedInARow + 1
    if (isAltDenial(r.deny) && !forcedGraphics) {
      graphics = 'no'
      bandRequest = undefined
      $.ui.invalidate('ui.render')
    } else if (refusedInARow >= 8) {
      // Not mounted there any more: wait for the next render to say where the band is.
      bandRequest = undefined
      refusedInARow = 0
    }
  } finally {
    isBlitting = false
  }
}

async function setMood($: EngineInterface, mood: Mood, tool?: string): Promise<void> {
  const since = await $.clock.now()
  await update($, bot, () => ({ mood, since, tool }))
}

/** Saves care, keeping gifts another session wrote unless this is a gift change. */
async function saveCare($: EngineInterface, next: Care, isGiftChange = false): Promise<void> {
  const raw = await $.store.get(STORE_KEY)
  const merged = raw === undefined || raw === null ? next : mergeCare(loadCare(raw, next.needs.at), next, isGiftChange)
  await update($, care, () => merged)
  await $.store.set(STORE_KEY, merged)
}

/** The claude.ai account's display name, from the CLI's global config. */
export async function accountName($: EngineInterface): Promise<string | null> {
  const dir = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? (await $.env.get('HOME'))
  if (dir) {
    try {
      const config = JSON.parse(await $.fs.read(`${dir}/.claude.json`)) as {
        oauthAccount?: { displayName?: string; emailAddress?: string }
      }
      const account = config.oauthAccount
      const name = account?.displayName?.trim() || account?.emailAddress?.split('@')[0]
      if (name) return name
    } catch {
      // No config, or not logged in through claude.ai: try the CLI.
    }
  }
  try {
    const { exitCode, stdout } = await $.process.run(['claude', 'auth', 'status', '--json'])
    const email = exitCode === 0 ? (JSON.parse(stdout) as { email?: string }).email : undefined
    if (email) return email.split('@')[0] ?? null
  } catch {
    // Fall through to the machine user.
  }
  return null
}

/** Answers `/pet` and its verbs. */
async function petCommand($: EngineInterface, args: string): Promise<string> {
  const now = await $.clock.now()
  const stored = (await read($, care)) ?? loadCare(undefined, now)
  const current: Care = expireDayOutfit({ ...stored, needs: settle(stored.needs, now, false) }, now)
  const [verb = '', ...rest] = args.trim().split(/\s+/)
  const arg = rest.join(' ')
  const name = current.petName

  switch (verb.toLowerCase()) {
    case 'bench': {
      const frames = Math.max(1, Math.min(2000, Number.parseInt(arg, 10) || 200))
      return formatBench(bench(bandColumns, frames, now))
    }
    case 'feed':
      if (current.needs.bowl >= 3) return `${name}'s bowl is already full.`
      await saveCare($, { ...current, needs: feed(current.needs) })
      return `You put food in ${name}'s bowl. It'll eat when it's hungry.`
    case 'play':
      await saveCare($, { ...current, needs: play(current.needs) })
      await setMood($, 'happy')
      return `You play with ${name}. ♥`
    case 'wear': {
      const allowed = wearable(current, now)
      const outfit = arg.toLowerCase() as Outfit
      if (!allowed.includes(outfit)) return `Outfits: ${allowed.join(', ')}`
      await saveCare($, { ...current, outfit })
      return outfit === 'auto' ? `${name} picks its own outfit again.` : `${name} now wears: ${outfit}.`
    }
    case 'name':
      if (!arg) return 'Usage: /pet name <name>'
      await saveCare($, { ...current, petName: arg.slice(0, 12) })
      return `Your pet is now called ${arg.slice(0, 12)}.`
    case 'open': {
      const [r] = rand(Math.floor(now) >>> 0)
      const opened = openGift(current, now, r)
      await saveCare($, opened.care, true)
      return opened.text
    }
    case 'style': {
      const style = arg.toLowerCase() as PetStyle
      if (!PET_STYLES.includes(style)) return `Styles: ${PET_STYLES.join(', ')} (now: ${current.style})`
      await saveCare($, { ...current, style })
      return `${name} is now a ${style}.`
    }
    case 'scene': {
      const v = arg.toLowerCase() === 'on' ? 'auto' : (arg.toLowerCase() as SceneChoice)
      if (!SCENE_CHOICES.includes(v)) return 'Usage: /pet scene auto|off|platformer|city|camp'
      await saveCare($, { ...current, scene: v })
      if (v === 'off') return 'Retro scene off.'
      return v === 'auto' ? 'Retro scene on: it changes every day.' : `Scene: ${v}.`
    }
    case '':
    case 'stats': {
      const n = current.needs
      await saveCare($, current)
      return [
        `${name} — ${current.style} — outfit: ${current.outfit}${current.gift ? ' — a gift is waiting: /pet open' : ''}`,
        `♥ happiness ${Math.round(n.happiness)}   ↯ energy ${Math.round(n.energy)}   ◔ fullness ${Math.round(100 - n.hunger)}   bowl ${n.bowl}/3`,
        `Verbs: /pet feed · /pet play · /pet open · /pet style <${PET_STYLES.join('|')}> · /pet scene auto|off|platformer|city|camp · /pet wear <${wearable(current, now).join('|')}> · /pet name <name>`,
      ].join('\n')
    }
    default:
      return `Usage: /pet [feed | play | open | style <${PET_STYLES.join('|')}> | scene <auto|off|platformer|city|camp> | wear <outfit> | name <name>]`
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    const now = await $.clock.now()
    const { context, rateLimits } = await $.session.usage()
    await update($, usage, () => toUsage(context, rateLimits))
    await update($, bot, b => ({ ...b, since: b.since || now }))
    const name = await accountName($)
    await update($, account, () => name)
    forcedGraphics = forced(await $.env.get('RETRO_GRAPHICS'))
    graphics = 'unknown'
    bandRequest = undefined
    probeRequest = undefined
    isRemote = Boolean(await $.env.get('SSH_CONNECTION'))

    // Time away counts as rest: hunger rises, energy comes back.
    const loaded = loadCare(await $.store.get(STORE_KEY), now)
    await saveCare($, { ...loaded, needs: settle(loaded.needs, now, true) })

    await $.command.register({
      name: 'pet',
      description: 'Your band pet: stats, feed, play, open, bench [frames], style <mochi|clawd|mini|classic>, scene <auto|off|platformer|city|camp>, wear <outfit>, name <name>',
    })

    $.clock.every(ART_FRAME_MS, async () => {
      try {
        await artBeat($)
      } catch {
        // A failed frame leaves the last one showing.
      }
    })

    // The beat: signals in, moods decay, happenings roll, the pet moves, needs settle.
    $.clock.every(FRAME_MS, async () => {
      const t = await $.clock.now()
      const b = await read($, bot)
      if ((b.mood === 'happy' || b.mood === 'error') && t - b.since > SETTLE_MS) {
        await update($, bot, () => ({ mood: 'idle', since: t }))
      } else if (b.mood === 'idle' && t - b.since > SLEEP_MS) {
        await update($, bot, () => ({ mood: 'sleeping', since: t }))
      }
      let c = await read($, care)
      const world = lastWorld
      let s: Scene = normalizeScene(await read($, scene))
      s = { ...s, frame: (s.frame + 1) % 100_000 }

      const arrived = pending
      pending = []
      for (const ev of arrived) s = guard(() => applySignal(s, ev, t), s)
      const paused = pauseCheck(typing, t)
      typing = paused.typing
      if (paused.fire) s = guard(() => applySignal(s, { signal: 'typing-paused' }, t), s)

      if (c) {
        const h = hungerCheck(s.memory, isHungry(c.needs), t)
        s = { ...s, memory: { ...s.memory, hungrySince: h.hungrySince, hasSaidHungry: h.hasSaidHungry } }
        if (h.fire) s = guard(() => applySignal(s, { signal: 'hungry' }, t), s)
      }

      if (world && c) {
        if (s.frame % ROLL_EVERY === 0) {
          try {
            const isFree = b.mood !== 'thinking' && b.mood !== 'working'
            const dice = roll(s.memory.seed, {
              isFree,
              isNight: phase(hourOf(t)) === 'night',
              hasGift: c.gift !== undefined,
              giftToday: c.lastGiftDay === localDay(t),
            })
            s = { ...s, memory: { ...s.memory, seed: dice.seed } }
            if (dice.roll.butterfly && !s.happenings.butterfly) {
              s = { ...s, happenings: { ...s.happenings, butterfly: spawnButterfly(t, dice.seed) } }
            }
            if (dice.roll.star) {
              s = { ...s, happenings: { ...s.happenings, star: { x: dice.seed % Math.max(1, Math.floor(world.w / 2)), at: t } } }
            }
            // Another session may have landed today's gift already: the store decides.
            const shared = loadCare(await $.store.get(STORE_KEY), t)
            if (dice.roll.gift && !shared.gift && shared.lastGiftDay !== localDay(t)) {
              c = landGift(c, t)
              await saveCare($, c, true)
            }
          } catch {
            // A failed roll skips this minute.
          }
        }
        const butterfly = guard(() => moveButterfly(s.happenings.butterfly, world, t), null)
        s = { ...s, happenings: { ...s.happenings, butterfly } }

        const cc = c
        const pet = s.pet ?? newPet(world, Math.floor(t) % 100_000)
        const isCampNight = sceneFor(cc.scene, t) === 'camp' && phase(hourOf(t)) === 'night'
        const campfire = isCampNight ? (campfireX(world) ?? null) : null
        const ctx = { world, mood: b.mood, needs: cc.needs, now: t, reaction: s.reaction, butterfly, hasGift: cc.gift !== undefined, campfire }
        const moved = guard(() => step(pet, ctx), { pet, ate: false })
        if (moved.pet.goal?.then === 'eat' && pet.goal?.then !== 'eat') {
          s = guard(() => applySignal(s, { signal: 'going-to-eat' }, t), s)
        }
        s = { ...s, pet: moved.pet }
        if (moved.ate) {
          await saveCare($, { ...cc, needs: eat(cc.needs) })
        } else if (s.frame % SAVE_EVERY === 0) {
          await saveCare($, expireDayOutfit({ ...cc, needs: settle(cc.needs, t, moved.pet.act === 'sleep') }, t))
        }
      }
      await update($, scene, () => s)
    })
    return result
  })

  on('command.run', { command: 'pet' }, async ($, e) => ({ text: await petCommand($, e.args) }))

  on('session.measure', async ($, e, next) => {
    const before = await read($, usage)
    const after = toUsage(e.context, e.rateLimits)
    await update($, usage, () => after)
    const now = percents(after)
    for (const ev of guard(() => fromBars(percents(before), now), [])) {
      const p = now[ev.bar ?? 0]
      pending = enqueue(pending, { ...ev, cells: p === undefined ? 0 : barCells(p).filled.length })
    }
    return next(e)
  })

  on('prompt.edit', async ($, e, next) => {
    const box = await next(e)
    try {
      const r = fromEdit(typing, box.text, await $.clock.now())
      typing = r.typing
      for (const signal of r.signals) pending = enqueue(pending, { signal })
    } catch {
      // Noticing typing is best effort.
    }
    return box
  })

  on('prompt.submit', async ($, e, next) => {
    typing = null
    turnStart = await $.clock.now()
    await setMood($, 'thinking')
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const streak = grepStreak(grepRun, e.tool)
    grepRun = streak.run
    if (streak.fire) pending = enqueue(pending, { signal: 'grep-streak' })
    await setMood($, 'working', e.tool)
    const c = await read($, care)
    if (c) await update($, care, () => ({ ...c, needs: work(c.needs) }))
    const result = await next(e)
    const command = (e as { command?: unknown }).command
    if (e.tool === 'Bash' && typeof command === 'string' && result.deny === undefined) {
      for (const signal of guard(() => fromBash(command, result.isError === true), [])) pending = enqueue(pending, { signal })
    }
    await setMood($, result.isError ? 'error' : 'thinking')
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const t = await $.clock.now()
    for (const signal of fromTurn(e.reason, turnStart ? t - turnStart : 0)) pending = enqueue(pending, { signal })
    turnStart = 0
    await setMood($, e.reason === 'answer' ? 'happy' : e.reason === 'aborted' ? 'idle' : 'error')
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      // The survey holds the band: nothing of ours is mounted until the next render.
      bandRequest = undefined
      probeRequest = undefined
      return next(e)
    }

    const name = await bandName($)
    const use = await read($, usage)
    const c = await read($, care)
    const now = await $.clock.now()

    // Real pixels: one Image the band's size, animated by the art beat's blits.
    const mode = forced(await $.env.get('RETRO_GRAPHICS')) ?? graphics
    const isArt = mode === 'yes' && (c?.scene ?? 'auto') !== 'off' && e.props.bodyColumns >= MIN_COLUMNS && e.props.bodyColumns <= MAX_COLUMNS && e.props.maxRows >= ART_ROWS
    if (e.surface === 'terminal' && isArt) {
      bandRequest = e.requestId
      bandColumns = e.props.bodyColumns
      const art = artFor(bandColumns)
      const board = boardFor(name, use, now)
      const rgba = frame(art, { t: artTime(now), now, board, look: lastLook, weather: lastWeather })
      const { Image } = $.ui.resolve(e)
      return <Image key="band" source={{ rgba: base64(rgba), width: art.w, height: art.h }} columns={bandColumns} rows={ART_ROWS} alt={altText(board)} />
    }
    bandRequest = undefined

    const b = await read($, bot)
    const s = normalizeScene(await read($, scene))
    const { Box, Text } = $.ui.resolve(e)

    const resetTail = (m: Meter | null) => {
      const left = m && resetsIn(m, now)
      return left ? `resets in ${left}` : undefined
    }
    const ctx = use.context
    const bars: Bar[] = [
      { label: 'CONTEXT', percent: ctx?.percent, tail: ctx?.tokens ? `${kTokens(ctx.tokens)}/${kTokens(ctx.window)}` : undefined },
      { label: 'SESSION', percent: use.session?.percentUsed, tail: resetTail(use.session) },
      { label: 'WEEKLY', percent: use.weekly?.percentUsed, tail: resetTail(use.weekly) },
    ]

    // Border and padding take four columns.
    const inner = e.props.bodyColumns - 4
    const fits = inner >= contentWidth(name, bars)
    const isRoomy = fits && e.props.maxRows >= ROOMY_ROWS + 2
    const isSnug = fits && !isRoomy && e.props.maxRows >= SNUG_ROWS + 2

    if (!isRoomy && !isSnug) {
      lastWorld = undefined
      return (
        <Box flexDirection="column">
          <Text bold color={GRADIENT[0]}>
            ▓▒░ {name.toUpperCase()} ░▒▓ <Text color="#d97757">{botFace(b.mood, s.frame)}</Text>
          </Text>
          {bars.map(bar => (
            <Text key={`bar-${bar.label}`} dimColor>
              {bar.label.padEnd(8)} {bar.percent === undefined ? '--' : `${Math.round(bar.percent)}%`}
              {bar.tail ? ` · ${bar.tail}` : ''}
            </Text>
          ))}
        </Box>
      )
    }

    const { canvas, world } = layout(name, bars, inner, isRoomy, BODIES[c?.style ?? DEFAULT_STYLE])
    lastWorld = world
    if (world && c) {
      const isRaining = s.weather?.kind === 'rain' && now < s.weather.until
      const shown = sceneFor(c.scene, now)
      if (shown) {
        paintScene(canvas, { world, scene: shown, hour: hourOf(now), frame: s.frame, now, weather: s.weather, star: s.happenings.star })
      } else {
        drawFloor(canvas, world)
      }
      drawBowl(canvas, world, c.needs.bowl)
      drawGift(canvas, world, c)
      drawHappenings(canvas, s.happenings, s.frame, now)
      if (s.pet) {
        const limits = [ctx?.percent, use.session?.percentUsed, use.weekly?.percentUsed]
        const isChill = limits.every(p => p !== undefined && p < CHILL_UNDER)
        const outfit = outfitFor(c.outfit, s.pet, b.mood, isChill, new Date(now).getHours())
        const isSweating = (ctx?.percent ?? 0) >= SWEAT_AT
        drawPet(canvas, s.pet, world, {
          mood: b.mood,
          outfit,
          tool: b.tool,
          isSweating,
          frame: s.frame,
          needs: c.needs,
          reaction: s.reaction,
          isRaining,
          now,
        })
        drawBubble(canvas, s.pet, s.bubble, now, world.body)
      }
      drawStats(canvas, world, c, s.pet ? doing(s.pet, b.mood, b.tool) : 'waking up')
    }

    // On a terminal that has not said whether it draws pixels, the last cell of
    // the top row is a transparent one-cell Image the art beat probes.
    const probe = e.surface === 'terminal' && mode === 'unknown'
    if (probe) probeRequest = e.requestId
    const textRow = (row: typeof canvas.cells[number], y: number) => (
      <Text key={`row-${y}`}>
        {runs(row).map((run, i) => (
          <Text key={`run-${y}-${i}`} color={run.style.fg} backgroundColor={run.style.bg} bold={run.style.bold} dimColor={run.style.dim}>
            {run.text}
          </Text>
        ))}
      </Text>
    )
    if (probe) {
      const { Image } = $.ui.resolve(e)
      const [top, ...rest] = canvas.cells
      return (
        <Box flexDirection="column" borderStyle="double" borderColor={GRADIENT[0]} paddingX={1}>
          <Box key="row-0" flexDirection="row">
            {textRow((top ?? []).slice(0, -1), 0)}
            <Image key="probe" source={PROBE_SOURCE} columns={1} rows={1} alt=" " />
          </Box>
          {rest.map((row, y) => textRow(row, y + 1))}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" borderStyle="double" borderColor={GRADIENT[0]} paddingX={1}>
        {canvas.cells.map((row, y) => (
          <Text key={`row-${y}`}>
            {runs(row).map((run, i) => (
              <Text
                key={`run-${y}-${i}`}
                color={run.style.fg}
                backgroundColor={run.style.bg}
                bold={run.style.bold}
                dimColor={run.style.dim}
              >
                {run.text}
              </Text>
            ))}
          </Text>
        ))}
      </Box>
    )
  })
}

/** The pet's name, needs and doing: atop the yard, or after the ledge without one. */
function drawStats(canvas: Canvas, world: World, c: Care, what: string): void {
  const n = c.needs
  const stats = `♥${Math.round(n.happiness)} ↯${Math.round(n.energy)} ◔${Math.round(100 - n.hunger)}`
  // Without a yard, the top row past the name (the perch ends there).
  const perch = world.platforms.find(p => p.id === 'perch')
  const x = world.yard ? world.yard.x0 : (perch ? perch.x1 + world.body.w + 2 : 0)
  const y = 0
  write(canvas, x, y, c.petName, { fg: '#d97757', bold: true })
  write(canvas, x + c.petName.length + 1, y, stats, { fg: '#bbbbbb' })
  write(canvas, x, y + 1, what, { dim: true })
}
