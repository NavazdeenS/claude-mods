/** Next pseudo-random number in [0, 1) and the seed after it: an LCG, deterministic for tests. */
export function rand(seed: number): [number, number] {
  const next = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return [next / 4294967296, next]
}

/** A stable hash of small integers, for star fields, rain and confetti. */
export function hash(...ns: number[]): number {
  let h = 2166136261
  for (const n of ns) h = Math.imul(h ^ (n | 0), 16777619) >>> 0
  return h
}
