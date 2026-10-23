// A tiny pet that lives in the band: it walks the platforms, jumps between
// them, uses a tool for each tool call, eats from its bowl, sleeps in its bed,
// watches you type, reacts to the bars, chases butterflies and minds its gifts.
import type { Act, Butterfly, Mood, Outfit, Pet, PlatformId, Reaction } from '../types'
import { type Canvas, type Style, write } from './canvas'
import { giftX } from './happenings'
import { BAR_CELLS, BAR_X, type Platform, type World } from './layout'
import { type Needs, isHungry, isTired } from './needs'
import { plot } from './pixel'
import { rand } from './rand'

export type { Act, Outfit, Pet }

export type Ctx = {
  world: World
  mood: Mood
  needs: Needs
  now: number
  reaction: Reaction
  butterfly: Butterfly | null
  hasGift: boolean
  /** The campfire's column when the camp scene shows at night, else null. */
  campfire: number | null
}

const BODY = '#d97757'
const HURT = '#ff3860'
const EYE = '#1a1a1a'
const SHUT = '#7a3524'
const PACE_SWAP_MS = 7000
const GIFT_SIT_MS = 20_000
const CAMPFIRE_SIT_MS = 30_000

/** How long a free-roam act lasts before the pet picks another. */
const DURATION: Record<Act, number> = {
  stand: 5,
  walk: 0,
  jump: 0,
  sit: 12,
  look: 8,
  eat: 12,
  sleep: 1e9,
  kick: 4,
  use: 1e9,
  cheer: 1e9,
  flinch: 1e9,
  attend: 1e9,
}

export const TOOL_ICONS: Record<string, string> = {
  Bash: '⚒',
  Read: '⌕',
  Grep: '⌕',
  Glob: '⌕',
  Edit: '✎',
  Write: '✎',
  NotebookEdit: '✎',
  WebFetch: '⊕',
  WebSearch: '⊕',
  Agent: '⚑',
  Task: '⚑',
}
export const toolIcon = (tool?: string) => (tool && TOOL_ICONS[tool]) || '⚙'

export const newPet = (world: World, seed = 7): Pet => {
  const p = platformOf(world, 'ledge') ?? world.platforms[0]
  return { x: p?.x0 ?? 0, y: p?.y ?? 0, platform: p?.id ?? 'ledge', facing: 1, act: 'stand', t: 0, seed }
}

const platformOf = (world: World, id: PlatformId): Platform | undefined => world.platforms.find(p => p.id === id)
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

/** Pixel rows per frame², and the farthest a jump carries the pet sideways. */
const GRAVITY = 1.8
const MAX_LEAP = 6

/** The nearest place on a platform where the pet has ground under both feet. */
function standX(p: Platform, x: number): number {
  const holds = p.footholds
  if (!holds || holds.length === 0) return clamp(x, p.x0, p.x1)
  return holds.reduce((best, f) => (Math.abs(f - x) < Math.abs(best - x) ? f : best), holds[0] ?? p.x0)
}

type Jump = NonNullable<Pet['jump']>

/** A ballistic jump: up to an apex two pixels above the higher end (never past the band's top), then down under gravity. */
function planJump(x0: number, y0: number, x1: number, y1: number, platform: PlatformId, h: number): Jump {
  const apex = Math.max(h - 1, Math.min(y0, y1) - 2 - 2 * Math.floor(Math.abs(x1 - x0) / 8))
  const up = Math.sqrt((2 * Math.max(0, y0 - apex)) / GRAVITY)
  const down = Math.sqrt((2 * Math.max(0, y1 - apex)) / GRAVITY)
  return { x0, y0, x1, y1, platform, apex, px: true, n: Math.max(2, Math.ceil(up + down)) }
}

/** Where a jump is at frame `t` of its `n`: x at an even pace, y on the parabola. */
function along(j: Jump, t: number): { x: number; y: number } {
  const up = Math.sqrt((2 * Math.max(0, j.y0 - j.apex)) / GRAVITY)
  const down = Math.sqrt((2 * Math.max(0, j.y1 - j.apex)) / GRAVITY)
  const total = up + down || 1
  const s = (t / j.n) * total
  const y = s <= up ? j.y0 - GRAVITY * up * s + (GRAVITY * s * s) / 2 : j.apex + (GRAVITY * (s - up) ** 2) / 2
  return { x: Math.round(j.x0 + ((j.x1 - j.x0) * s) / total), y: Math.max(j.apex, Math.round(y)) }
}
const sign = (n: number): 1 | -1 => (n < 0 ? -1 : 1)
const live = (r: Reaction, now: number) => (r && now < r.until ? r : null)
const isTypingKind = (r: Reaction) => r !== null && (r.kind === 'look-down' || r.kind === 'wide-eyes' || r.kind === 'tilt' || r.kind === 'shrug')

/** Keeps the pet on a platform that exists, after a resize. */
function normalize(pet: Pet, world: World): Pet {
  const p = platformOf(world, pet.platform)
  if (!p) {
    const home = newPet(world, pet.seed)
    return { ...home, ball: pet.ball }
  }
  const goal = pet.goal && platformOf(world, pet.goal.platform) ? pet.goal : undefined
  // A jump saved in cell rows (an older version's) is dropped: the pet lands where it is.
  const jump = pet.jump && pet.jump.px && platformOf(world, pet.jump.platform) ? pet.jump : undefined
  const x = jump ? pet.x : standX(p, pet.x)
  return { ...pet, x, y: jump ? pet.y : p.y, goal, jump, act: pet.jump && !jump ? 'stand' : pet.act }
}

/** What the session, the pet's needs or what is going on around it ask for, if anything. */
function want(pet: Pet, ctx: Ctx): NonNullable<Pet['goal']> | { act: Act } | undefined {
  const { world, mood, needs, now } = ctx
  // Typing is noticed even mid-thought; only work and tools keep the pet's back turned.
  if (mood === 'thinking' && isTypingKind(live(ctx.reaction, now))) return { act: 'attend' }
  switch (mood) {
    case 'working':
      return { ...world.bench, then: 'use' }
    case 'thinking': {
      const perch = platformOf(world, 'perch')
      return perch ? { x: standX(perch, pet.x), platform: 'perch', then: 'sit' } : { act: 'sit' }
    }
    case 'happy':
      return { act: 'cheer' }
    case 'error':
      return { act: 'flinch' }
    default:
      break
  }
  if (mood === 'sleeping' || isTired(needs)) {
    return world.bed ? { ...world.bed, then: 'sleep' } : { act: 'sleep' }
  }
  if (isHungry(needs) && needs.bowl > 0 && world.bowl) {
    return { ...world.bowl, then: 'eat' }
  }
  const r = live(ctx.reaction, now)
  const ledge = platformOf(world, 'ledge')
  if (r && isTypingKind(r)) return { act: 'attend' }
  if (r && ledge) {
    if (r.kind === 'pace') {
      const far = Math.min(ledge.x1, BAR_X + BAR_CELLS - world.body.w)
      return { x: Math.floor(now / PACE_SWAP_MS) % 2 === 0 ? BAR_X : far, platform: 'ledge', then: 'look' }
    }
    if (r.kind === 'hop') return { x: Math.min(ledge.x1, BAR_X + Math.max(0, (r.cells ?? 0) - 2)), platform: 'ledge', then: 'look' }
    if (r.kind === 'nap') return { x: pet.platform === 'ledge' ? pet.x : BAR_X, platform: 'ledge', then: 'sleep' }
  }
  if (ctx.butterfly && mood === 'idle') {
    const here = platformOf(world, pet.platform)
    if (here && !here.footholds) return { x: clamp(ctx.butterfly.x, here.x0, here.x1), platform: here.id, then: 'look' }
  }
  if (ctx.campfire !== null && mood === 'idle' && world.yard && Math.floor(now / CAMPFIRE_SIT_MS) % 2 === 0) {
    return { x: ctx.campfire - world.body.w - 1, platform: 'floor', then: 'sit' }
  }
  const gx = giftX(world)
  if (ctx.hasGift && gx !== undefined && mood === 'idle' && Math.floor(now / GIFT_SIT_MS) % 2 === 0) {
    return { x: gx - world.body.w, platform: 'floor', then: 'sit' }
  }
  return undefined
}

/** A free-roam choice once the current act has run its course. */
function roam(pet: Pet, world: World): Pet {
  const [r, s1] = rand(pet.seed)
  const [r2, s2] = rand(s1)
  const here = platformOf(world, pet.platform)
  const others = world.platforms.filter(p => p.id !== pet.platform)
  const pet2 = { ...pet, seed: s2, t: 0 }
  if (r < 0.35 && here && !here.footholds) {
    return { ...pet2, goal: { x: Math.round(here.x0 + r2 * (here.x1 - here.x0)), platform: here.id, then: 'look' } }
  }
  if (r < 0.62 && others.length > 0) {
    const to = others[Math.floor(r2 * others.length)] ?? others[0]
    if (to) return { ...pet2, goal: { x: Math.round(to.x0 + r2 * (to.x1 - to.x0)), platform: to.id, then: 'stand' } }
  }
  if (r < 0.77) return { ...pet2, act: 'sit' }
  if (r < 0.88 || !pet.ball || !world.yard) return { ...pet2, act: 'look' }
  // Go kick the ball: stand beside it, on the side with room.
  const floor = platformOf(world, 'floor')
  const left = pet.ball.x - world.body.w
  const x = floor && left >= floor.x0 ? left : pet.ball.x + 1
  return { ...pet2, goal: { x, platform: 'floor', then: 'kick' } }
}

/** Moves the ball one frame: it rolls, slows and bounces off the yard's ends. */
function rollBall(pet: Pet, world: World): Pet['ball'] {
  const yard = world.yard
  if (!yard) return undefined
  const ball = pet.ball ?? { x: yard.x0 + 3, vx: 0 }
  const hi = world.bowl ? world.bowl.x + world.body.w - 1 : yard.x1
  let x = ball.x + ball.vx
  let vx = ball.vx === 0 ? 0 : ball.vx - sign(ball.vx)
  if (x < yard.x0 || x > hi) {
    x = clamp(x, yard.x0, hi)
    vx = -vx
  }
  return { x, vx }
}

/** One animation frame of the pet. `ate` says it ate a portion this frame. */
export function step(pet0: Pet, ctx: Ctx): { pet: Pet; ate: boolean } {
  const { world } = ctx
  let pet: Pet = { ...normalize(pet0, world), ball: rollBall(pet0, world) }

  if (pet.jump) {
    const j = pet.jump
    const t = pet.t + 1
    if (t >= j.n) {
      return { pet: { ...pet, x: j.x1, y: j.y1, platform: j.platform, jump: undefined, act: 'stand', t: 0 }, ate: false }
    }
    const at = along(j, t)
    return { pet: { ...pet, x: at.x, y: at.y, t }, ate: false }
  }

  const w = want(pet, ctx)
  if (w && 'act' in w) {
    return { pet: { ...pet, goal: undefined, act: w.act, t: pet.act === w.act ? pet.t + 1 : 0 }, ate: false }
  }
  if (w) pet = { ...pet, goal: w }
  else if (!pet.goal && pet.t >= DURATION[pet.act]) pet = roam(pet, world)
  else if (
    !pet.goal &&
    (pet.act === 'use' || pet.act === 'cheer' || pet.act === 'flinch' || pet.act === 'sleep' || pet.act === 'attend')
  ) {
    pet = roam({ ...pet, act: 'stand' }, world)
  }

  const goal = pet.goal
  if (!goal) {
    const t = pet.t + 1
    return { pet: { ...pet, t }, ate: pet.act === 'eat' && t === 8 }
  }

  const target = platformOf(world, goal.platform)
  const here = platformOf(world, pet.platform)
  if (!target || !here) return { pet: { ...pet, goal: undefined }, ate: false }
  const tx = standX(target, goal.x)

  if (goal.platform === pet.platform) {
    if (pet.x === tx) {
      const isSame = pet.act === goal.then
      const t = isSame ? pet.t + 1 : 0
      let arrived: Pet = { ...pet, act: goal.then, t, goal: w ? goal : undefined }
      if (goal.then === 'use') arrived = { ...arrived, facing: 1 }
      if (goal.then === 'kick' && arrived.ball && !isSame) {
        const facing = sign(arrived.ball.x - pet.x)
        arrived = { ...arrived, facing, ball: { ...arrived.ball, vx: facing * 4 } }
      }
      return { pet: arrived, ate: goal.then === 'eat' && t === 8 }
    }
    // On the name there is no walking across the gaps: it hops from letter to letter.
    if (here.footholds) return { pet: leap(pet, tx, here, world), ate: false }
    const dir = sign(tx - pet.x)
    return { pet: { ...pet, x: pet.x + dir, facing: dir, act: 'walk', t: pet.t + 1 }, ate: false }
  }

  // Another platform. The name and the yard are reached by way of the girder.
  const ledge = platformOf(world, 'ledge')
  const isDetour = (here.id === 'floor' && target.id === 'perch') || (here.id === 'perch' && target.id === 'floor')
  const via = ledge && isDetour ? ledge : target
  const vx = via === target ? tx : clamp(tx, via.x0, via.x1)
  // Walk (never along the name) to the nearest launch point, then leap at most MAX_LEAP across.
  const launch = clamp(vx, here.x0, here.x1)
  if (!here.footholds && pet.x !== launch && Math.abs(pet.x - vx) > MAX_LEAP) {
    const dir = sign(launch - pet.x)
    return { pet: { ...pet, x: pet.x + dir, facing: dir, act: 'walk', t: pet.t + 1 }, ate: false }
  }
  return { pet: leap(pet, standX(via, clamp(vx, pet.x - MAX_LEAP, pet.x + MAX_LEAP)), via, world), ate: false }
}

/** Starts a jump from where the pet stands to (x, the platform's feet row). */
function leap(pet: Pet, x: number, to: Platform, world: World): Pet {
  return { ...pet, act: 'jump', t: 0, facing: sign(x - pet.x), jump: planJump(pet.x, pet.y, x, to.y, to.id, world.body.h) }
}

/** The outfit the pet wears now. */
export function outfitFor(choice: Outfit, pet: Pet, mood: Mood, isChill: boolean, hour: number): Exclude<Outfit, 'auto'> {
  if (choice !== 'auto') return choice
  if (pet.act === 'use' || mood === 'working') return 'hardhat'
  if (mood === 'happy' || pet.act === 'cheer') return 'party'
  if (pet.act === 'sleep' || mood === 'sleeping' || hour >= 23 || hour < 6) return 'nightcap'
  if (isChill) return 'shades'
  return 'none'
}

export type Look = {
  mood: Mood
  outfit: Exclude<Outfit, 'auto'>
  tool?: string
  isSweating: boolean
  frame: number
  needs: Needs
  reaction: Reaction
  isRaining: boolean
  now: number
}

/** Hats as pixels over the top row of the body: [dx from the left, dy above the top, colour]. */
function hatPixels(outfit: Look['outfit'], w: number): [number, number, string][] {
  const mid = Math.floor((w - 1) / 2)
  const row = (dy: number, from: number, to: number, color: string) => Array.from({ length: Math.max(0, to - from + 1) }, (_, i): [number, number, string] => [from + i, dy, color])
  switch (outfit) {
    case 'hardhat':
      return [...row(1, 0, w - 1, '#ffd319'), ...row(2, 1, w - 2, '#ffd319')]
    case 'party':
      return [...row(1, mid - 1, mid + 1, '#ff2bd6'), [mid, 2, '#ff2bd6'], [mid, 3, '#ffd319']]
    case 'nightcap':
      return [...row(1, 0, w - 1, '#5b6cff'), ...row(2, 1, w - 2, '#5b6cff'), [w - 1, 2, '#ffffff']]
    case 'crown':
      return [...row(1, 0, w - 1, '#ffd319'), ...Array.from({ length: w }, (_, i): [number, number, string] => [i, 2, '#ffd319']).filter(([i]) => i % 2 === 0)]
    case 'wizard':
      return [...row(1, 0, w - 1, '#9b5de5'), ...row(2, 1, w - 2, '#9b5de5'), [mid, 3, '#9b5de5'], [mid, 2, '#ffd319']]
    default:
      return []
  }
}

/** Draws the pet, what it holds and wears, and the ball onto the canvas. */
export function drawPet(c: Canvas, pet: Pet, world: World, look: Look): void {
  const { frame } = look
  const b = world.body
  const r = live(look.reaction, look.now)
  const x = pet.x
  // A cheer is a real hop: on its up beats the whole pet is two pixels higher.
  // Asleep on the bed, it lies on the mattress, a pixel up.
  const onBed = pet.act === 'sleep' && world.bed !== undefined && pet.platform === world.bed.platform && pet.x === world.bed.x
  const lift = pet.act === 'cheer' && frame % 2 === 0 ? 2 : onBed ? 1 : 0
  const feet = pet.y - lift
  const color = look.mood === 'error' || pet.act === 'flinch' ? HURT : BODY

  if (pet.ball && world.yard) write(c, pet.ball.x, world.yard.y, '●', { fg: '#00e5ff', bold: true })

  // The frame: in the air, sitting (or the squat after landing), a step, or standing.
  const isLanding = pet.act === 'stand' && pet.t === 0
  const rows =
    pet.act === 'jump' || lift === 2
      ? b.air
      : pet.act === 'sit' || pet.act === 'sleep' || pet.act === 'eat' || isLanding
        ? b.sit
        : pet.act === 'walk' && frame % 2 === 1
          ? b.step
          : b.stand
  const top = feet - b.h + 1
  const mirror = (col: number) => (pet.facing < 0 ? b.w - 1 - col : col)

  // Where the eyes look: ahead while moving, around while looking.
  let lookDx = 0
  if (pet.act === 'walk' || pet.act === 'jump') lookDx = pet.facing
  if (pet.act === 'look') lookDx = [-1, 0, 1, 0][Math.floor(pet.t / 2) % 4] ?? 0
  const isShut = pet.act === 'sleep' ? !(isTypingKind(r) && frame % 2 === 0) : frame % 14 === 0 && pet.act !== 'attend'
  const shades = look.outfit === 'shades' && pet.act !== 'sleep'
  const eyeColor = isShut ? SHUT : EYE

  let eyeRow = -1
  const eyeCols: number[] = []
  rows.forEach((line, ry) => {
    ;[...line].forEach((ch, col) => {
      if (ch === '.') return
      const cx = x + mirror(col)
      plot(c, cx, top + ry, color)
      if (ch === 'o') {
        eyeRow = ry
        eyeCols.push(mirror(col))
      }
    })
  })
  if (eyeRow >= 0) {
    const line = rows[eyeRow] ?? ''
    const isBody = (col: number) => col >= 0 && col < b.w && line[pet.facing < 0 ? b.w - 1 - col : col] !== '.'
    const dx = eyeCols.every(col => isBody(col + lookDx)) ? lookDx : 0
    const cols = eyeCols.map(col => col + dx)
    if (shades) {
      for (let col = Math.min(...cols); col <= Math.max(...cols); col++) plot(c, x + col, top + eyeRow, EYE)
    } else {
      for (const col of cols) plot(c, x + col, top + eyeRow, eyeColor)
    }
  }

  // Hat, in pixels right on top of the head.
  for (const [dx, dy, hc] of hatPixels(look.outfit, b.w)) plot(c, x + dx, top - dy, hc)

  // What it holds and what floats around it, as glyphs in the cells beside it.
  const headY = Math.max(0, (top + Math.max(0, eyeRow)) >> 1)
  const feetY = feet >> 1
  const above = Math.max(0, (top >> 1) - 1)
  const put = (dx: number, y: number, text: string, style: Style) => {
    ;[...text].forEach((ch, i) => ch !== ' ' && write(c, x + dx + i, y, ch, style))
  }
  const W = b.w
  const side = pet.facing > 0 ? W : -1
  if (pet.act === 'use') put(side, frame % 2 === 0 ? headY : feetY, toolIcon(look.tool), { fg: '#e0e0e0', bold: true })
  if (pet.act === 'eat' && frame % 2 === 0) put(side, headY, '·', { fg: '#ffa640' })
  if (look.isRaining && pet.act !== 'use' && pet.act !== 'eat' && pet.act !== 'sleep') put(W, above, '☂', { fg: '#8fa8ff', bold: true })
  if (look.mood === 'thinking') put(W, above, '.'.repeat(1 + (frame % 3)), { fg: '#ffffff' })
  if (pet.act === 'sleep') {
    const note = r?.kind === 'nap'
    put(W + (frame % 4 < 2 ? 0 : 1), Math.max(0, above - (frame % 2)), note ? '♪' : frame % 4 < 2 ? 'z' : 'Z', { fg: note ? '#ff2bd6' : '#8888ff' })
  }
  if (pet.act === 'cheer') put(frame % 2 === 0 ? -1 : W, above, '✦', { fg: '#ffd319' })
  if (pet.act === 'flinch' && frame % 2 === 0) put(W, above, '!', { fg: HURT })
  if (pet.act === 'attend' && r?.kind === 'wide-eyes') put(W, above, '!', { fg: '#ffd319' })
  if (pet.act === 'attend' && r?.kind === 'tilt') put(W, above, '?', { fg: '#ffffff' })
  if (pet.act === 'attend' && r?.kind === 'shrug') {
    put(-1, headY, '¯', { fg: color })
    put(W, headY, '¯', { fg: color })
  }
  if ((look.isSweating || r?.kind === 'pace') && pet.act !== 'use') put(pet.facing > 0 ? -1 : W, headY, '▗', { fg: '#00e5ff' })
  if (isHungry(look.needs) && pet.act !== 'eat' && pet.act !== 'sleep' && frame % 4 < 2) put(W, headY, '♨', { fg: '#ff9f1c' })
}

/** What the pet is doing, in a word or two. */
export function doing(pet: Pet, mood: Mood, tool?: string): string {
  if (pet.act === 'use') return `${toolIcon(tool)} ${tool ?? 'working'}`
  if (pet.goal?.then === 'use') return 'off to work'
  if (pet.goal?.then === 'eat' || pet.act === 'eat') return pet.act === 'eat' ? 'eating' : 'going to eat'
  if (pet.goal?.then === 'sleep') return 'going to bed'
  if (mood === 'thinking') return 'thinking'
  const words: Record<Act, string> = {
    stand: 'hanging out',
    walk: 'wandering',
    jump: 'jumping',
    sit: 'sitting',
    look: 'looking around',
    eat: 'eating',
    sleep: 'sleeping',
    kick: 'playing ball',
    use: 'working',
    cheer: 'celebrating',
    flinch: 'ouch',
    attend: 'watching you',
  }
  return words[pet.act]
}
