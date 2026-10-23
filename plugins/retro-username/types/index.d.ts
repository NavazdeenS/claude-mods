/** The pet's needs, 0-100 each, settled up to `at`; `bowl` is portions of food. */
export type Needs = { hunger: number; happiness: number; energy: number; bowl: number; at: number }
export type Act = 'stand' | 'walk' | 'jump' | 'sit' | 'look' | 'eat' | 'sleep' | 'kick' | 'use' | 'cheer' | 'flinch' | 'attend'
export type Outfit = 'auto' | 'none' | 'hardhat' | 'party' | 'nightcap' | 'shades' | 'crown' | 'wizard'
export type SceneChoice = 'auto' | 'off' | 'platformer' | 'city' | 'camp'
export type PlatformId = 'perch' | 'ledge' | 'floor'
/** Which body the pet has: a pixel sprite each. */
export type PetStyle = 'mochi' | 'clawd' | 'mini' | 'classic'
export type Pet = {
  /** The left edge, in cells. */
  x: number
  /** The pixel row of the feet, two pixel rows per cell row. */
  y: number
  platform: PlatformId
  facing: 1 | -1
  act: Act
  t: number
  goal?: { x: number; platform: PlatformId; then: Act }
  /** A ballistic jump over `n` frames, rising to pixel row `apex`; `px` marks pixel rows (older saves used cell rows). */
  jump?: { x0: number; y0: number; x1: number; y1: number; platform: PlatformId; n: number; apex: number; px?: true }
  ball?: { x: number; vx: number }
  seed: number
}
export type Meter = { percentUsed: number; resetsAt?: string }
export type ContextFill = { percent: number; tokens?: number; window: number }
export type Usage = { context: ContextFill | null; session: Meter | null; weekly: Meter | null }
export type Mood = 'idle' | 'thinking' | 'working' | 'happy' | 'error' | 'sleeping'
export type Bot = { mood: Mood; since: number; tool?: string }
export type Weather = { kind: 'rain' | 'rainbow'; until: number } | null
export type Bubble = { text: string; until: number } | null
export type Butterfly = { x: number; y: number; until: number }
export type Happenings = { butterfly: Butterfly | null; confettiUntil: number; star: { x: number; at: number } | null }
export type ReactionKind = 'look-down' | 'wide-eyes' | 'tilt' | 'shrug' | 'pace' | 'hop' | 'nap'
/** What the pet is reacting to until `until`; `cells` is a bar's filled cells for bar reactions. */
export type Reaction = { kind: ReactionKind; until: number; cells?: number } | null
export type Memory = { seed: number; lastBubbleAt: number; hasRained: boolean; hungrySince: number; hasSaidHungry: boolean }
/** What the band animates: the beat, the pet, and what is going on around it. */
export type Scene = {
  frame: number
  pet: Pet | null
  weather: Weather
  bubble: Bubble
  happenings: Happenings
  reaction: Reaction
  memory: Memory
}
/** The pet's care, kept across sessions in the store under `pet`. */
export type Care = {
  needs: Needs
  petName: string
  outfit: Outfit
  scene: SceneChoice
  style: PetStyle
  gift?: { landedAt: number; day: string }
  dayOutfit?: { outfit: 'crown' | 'wizard'; day: string }
  lastGiftDay?: string
}

declare module 'claude-code' {
  interface PluginState {
    'retro-username': { usage: Usage; bot: Bot; scene: Scene; name: string | null; care: Care | null }
  }
}
