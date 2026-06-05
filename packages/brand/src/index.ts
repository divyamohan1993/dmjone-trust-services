/**
 * @dmjone/brand — the single source of the dmj.one visual language.
 *
 * Extracted verbatim from the approved letterhead template's `:root`. Consumed
 * by the certificate renderer (PDF) and the public verify page (web) so both
 * surfaces stay in lockstep. Tokens only — no framework, no runtime.
 */

/** Core palette. */
export const COLORS = {
  ink: '#2B2A28',
  inkSoft: '#5C554D',
  paper: '#FFFDFB',
  gold: '#B0892F',
  goldDeep: '#876616',
  goldSoft: '#CBA85E',
} as const;

/** Font family stacks. The named families are bundled via @fontsource/*. */
export const FONTS = {
  serif: '"EB Garamond", Georgia, serif',
  display: '"Playfair Display", Georgia, serif',
  label: '"Marcellus", "EB Garamond", serif',
  script: '"Great Vibes", cursive',
} as const;

/** The four font families that must be bundled (no network at render time). */
export const FONT_FAMILIES = [
  'EB Garamond',
  'Playfair Display',
  'Marcellus',
  'Great Vibes',
] as const;

/** Issuer-facing identity strings shown on web surfaces. */
export const IDENTITY = {
  name: 'dmj.one',
  trustService: 'dmj.one Trust Services',
  descriptor: 'Educational Platform · Independent Learning Initiative',
  motto: 'Dream · Manifest · Journey · Together as One',
  email: 'contact@dmj.one',
  phone: '+91 79799 30293',
} as const;

export type BrandColors = typeof COLORS;
export type BrandFonts = typeof FONTS;

/** Emit the palette + fonts as CSS custom properties for a :root block. */
export function cssVariables(): string {
  return [
    `--ink:${COLORS.ink}`,
    `--ink-soft:${COLORS.inkSoft}`,
    `--paper:${COLORS.paper}`,
    `--gold:${COLORS.gold}`,
    `--gold-deep:${COLORS.goldDeep}`,
    `--gold-soft:${COLORS.goldSoft}`,
    `--serif:${FONTS.serif}`,
    `--display:${FONTS.display}`,
    `--label:${FONTS.label}`,
    `--script:${FONTS.script}`,
  ].join(';');
}
