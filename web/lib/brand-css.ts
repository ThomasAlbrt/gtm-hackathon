import type { BrandKit, FontLink } from "./contacts";

/**
 * Sanitization barrier + CSS generation for brand theming.
 *
 * SECURITY INVARIANT: every value in a BrandKit comes from an external API
 * (brand resolution) and ends up injected into CSS. Nothing may reach a
 * stylesheet or a style attribute without passing through these sanitizers.
 * Preserve this barrier.
 */

/**
 * Contract: return the value when it is a strict hex color
 * (/^#[0-9a-fA-F]{3,8}$/), undefined otherwise.
 */
export function sanitizeHexColor(_value?: string): string | undefined {
  throw new Error("Not implemented (B2-WPA)");
}

/**
 * Contract: return the value when it matches /^[a-zA-Z0-9 _-]+$/ (a safe CSS
 * font family name), undefined otherwise.
 */
export function sanitizeFontFamily(_value?: string): string | undefined {
  throw new Error("Not implemented (B2-WPA)");
}

/**
 * Contract: build @font-face rules for the given links. Skip any link whose
 * family fails sanitizeFontFamily or whose url is not https. Weight only when
 * it matches /^[1-9]00$/; style only "normal" | "italic". format() mapped from
 * the file extension (woff2/woff/ttf → "truetype"/otf → "opentype"); omit
 * format() for unknown extensions. Always font-display: swap. Returns "" for
 * missing/empty input.
 */
export function fontFaceRules(_links?: FontLink[]): string {
  throw new Error("Not implemented (B2-WPA)");
}

/**
 * Contract: map a BrandKit to CSS custom properties. Keys emitted (only when
 * the source value exists AND passes its sanitizer): --brand-accent,
 * --brand-background, --brand-text, --brand-cta, --brand-cta-text,
 * --brand-palette-1..3 (first three palette entries), --brand-font-heading,
 * --brand-font-body, --brand-font-accent. Returns {} for null/undefined brand.
 */
export function brandCssVars(
  _brand?: BrandKit | null,
): Record<string, string> {
  throw new Error("Not implemented (B2-WPA)");
}
