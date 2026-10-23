import type { Mood } from '../types'

/** A one-line face for cramped bands, where the pet has no room to roam. */
export function botFace(mood: Mood, frame: number): string {
  const faces: Record<Mood, string[]> = {
    idle: ['[•_•]', '[•_•]', '[-_-]', ' [•_•]', '  [•_•]', ' [•_•]'],
    thinking: ['[•_•] .', '[•_•] ..', '[•_•] ...'],
    working: ['[•_•]⚒', '[•_•] ⚒'],
    happy: ['[^‿^]✦', '[^‿^] ✦'],
    error: ['[>_<]!', '[>_<]'],
    sleeping: ['[-_-] z', '[-_-] zZ'],
  }
  const list = faces[mood]
  return list[frame % list.length] ?? list[0] ?? ''
}
