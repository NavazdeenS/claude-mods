// The pet's bodies as pixel sprites: one pixel is a cell wide and half a cell
// tall, so the feet can land on a platform's top pixel. '#' is body, 'o' an eye.
import type { PetStyle } from '../types'

export type { PetStyle }
export type Body = {
  style: PetStyle
  w: number
  h: number
  stand: readonly string[]
  /** The other walking frame. */
  step: readonly string[]
  air: readonly string[]
  /** Sitting, sleeping, eating and the squat after a landing: a pixel lower. */
  sit: readonly string[]
  /** Columns of the feet in the standing frame. */
  feet: readonly number[]
}

const body = (style: PetStyle, stand: string[], step: string[], air: string[], sit: string[]): Body => {
  const last = stand[stand.length - 1] ?? ''
  const feet = [...last].flatMap((ch, i) => (ch === '#' ? [i] : []))
  return { style, w: (stand[0] ?? '').length, h: stand.length, stand, step, air, sit, feet }
}

export const BODIES: Record<PetStyle, Body> = {
  mochi: body('mochi', ['.###.', '#####', '#o#o#', '#####', '.#.#.'], ['.###.', '#####', '#o#o#', '#####', '#...#'], ['.###.', '#####', '#o#o#', '.###.', '.....'], ['.....', '.###.', '#####', '#o#o#', '#####']),
  clawd: body(
    'clawd',
    ['.#####.', '.#o#o#.', '#######', '.#####.', '.##.##.'],
    ['.#####.', '.#o#o#.', '#######', '.#####.', '.#.#.#.'],
    ['.#####.', '#.o#o.#', '#######', '.#####.', '.......'],
    ['.......', '.#####.', '.#o#o#.', '#######', '.#####.'],
  ),
  mini: body('mini', ['.###.', '#o#o#', '.###.', '.#.#.'], ['.###.', '#o#o#', '.###.', '#...#'], ['.###.', '#o#o#', '.###.', '.....'], ['.....', '.###.', '#o#o#', '.###.']),
  classic: body('classic', ['#o#o#', '#####', '#...#'], ['#o#o#', '#####', '.#.#.'], ['#o#o#', '#####', '.....'], ['.....', '#o#o#', '#####']),
}

export const PET_STYLES: readonly PetStyle[] = ['mochi', 'clawd', 'mini', 'classic']
export const DEFAULT_STYLE: PetStyle = 'mochi'
/** The tallest body, which the band's rows are laid out for. */
export const MAX_H = Math.max(...PET_STYLES.map(s => BODIES[s].h))
