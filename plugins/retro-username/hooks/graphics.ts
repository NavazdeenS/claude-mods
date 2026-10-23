// Whether this terminal draws real pixels. Nothing says so up front: the text
// band carries a one-cell, transparent probe Image, and the first blit to it
// tells — taken means pixels, an alt denial means none. RETRO_GRAPHICS=on|off
// overrides the probe.

export type Graphics = 'unknown' | 'yes' | 'no'

/** True only for the denial an Image gets when the terminal draws its alt text instead. */
export const isAltDenial = (deny: string | undefined): boolean => deny?.startsWith('the Image draws its alt') === true

export function forced(env: string | undefined): Graphics | undefined {
  if (env === 'on') return 'yes'
  if (env === 'off') return 'no'
  return undefined
}

/** A single transparent pixel: the probe shows nothing either way. */
export const PROBE_SOURCE = { rgba: 'AAAAAA==', width: 1, height: 1 } as const
