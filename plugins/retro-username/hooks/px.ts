// A pixel surface for the real-pixel band: packed 0xRRGGBB colours plus a flag
// for pixels that light themselves (sky, flames, screens), which the light
// pass leaves alone. `ox` shifts every write, so a group can be drawn at an offset.

export type Surface = { w: number; h: number; col: Uint32Array; emit: Uint8Array; ox: number }

export const surface = (w: number, h: number): Surface => ({ w, h, col: new Uint32Array(w * h), emit: new Uint8Array(w * h), ox: 0 })

export const hx = (hex: string): number => parseInt(hex.slice(1, 7), 16)

export function set(s: Surface, x: number, y: number, c: number, lit = false): void {
  // Bit truncation, not Math.floor: Math calls are slow in the mod runtime.
  const fx = x + s.ox
  if (fx < 0 || y < 0) return
  const px = fx | 0
  const py = y | 0
  if (px >= s.w || py >= s.h) return
  const i = py * s.w + px
  s.col[i] = c
  s.emit[i] = lit ? 1 : 0
}

export function rect(s: Surface, x0: number, y0: number, x1: number, y1: number, c: number, lit = false): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(s, x, y, c, lit)
}

/** Rows of characters through a palette; characters in `lit` are self-lit, others in no palette are skipped. */
export function spr(s: Surface, x: number, y: number, rows: readonly string[], pal: Record<string, number>, lit = ''): void {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[i] as string
      const c = pal[ch]
      if (c !== undefined) set(s, x + i, y + j, c, lit.includes(ch))
    }
  })
}

export function disc(s: Surface, cx: number, cy: number, r: number, c: number, lit = false): void {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) set(s, cx + x, cy + y, c, lit)
}

export function line(s: Surface, x0: number, y0: number, x1: number, y1: number, c: number, lit = false): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
  for (let i = 0; i <= n; i++) set(s, Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n), c, lit)
}

export function copy(dst: Surface, src: Surface): void {
  dst.col.set(src.col)
  dst.emit.set(src.emit)
}
