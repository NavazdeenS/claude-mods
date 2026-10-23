// A 3x5 pixel font for the chalkboard: 15 bits per glyph, row by row.
import { type Surface, set } from './px'

export const GLYPHS: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', '0': '010101101101010', '1': '010110010010111', '2': '110001010100111', '3': '110001010001110',
  '4': '101101111001001', '5': '111100110001110', '6': '011100110101010', '7': '111001010010010', '8': '010101010101010',
  '9': '010101011001110', '%': '101001010100101', '/': '001001010100100', '.': '000000000000010', ':': '000010000010000',
  '-': '000000111000000', '·': '000000010000000', ' ': '000000000000000',
}

/** Pixels across `text`: four per letter (three and a gap), less the last gap. */
export const textWidth = (text: string, scale = 1): number => (text.length === 0 ? 0 : [...text].length * 4 * scale - scale)

export function drawText(s: Surface, x: number, y: number, text: string, color: number, opts: { scale?: number; lit?: boolean; rough?: number } = {}): void {
  const sc = opts.scale ?? 1
  ;[...text.toUpperCase()].forEach((ch, i) => {
    const g = GLYPHS[ch]
    if (!g) return
    for (let j = 0; j < 15; j++) {
      if (g[j] !== '1') continue
      for (let a = 0; a < sc; a++) {
        for (let b = 0; b < sc; b++) {
          const px = x + i * 4 * sc + (j % 3) * sc + a
          const py = y + Math.floor(j / 3) * sc + b
          // Chalk: a few pixels of each stroke are missing.
          if (opts.rough && (px * 7 + py * 13) % opts.rough === 0) continue
          set(s, px, py, color, opts.lit)
        }
      }
    }
  })
}
