import type { BrandKit } from "./contacts.js";

/**
 * Brand resolution via Context.dev. WHOLE MODULE IS BEST-EFFORT: a brand
 * failure must never block landing-page creation — callers always receive
 * null instead of an exception for resolution failures.
 */

/**
 * Contract: resolve a BrandKit for a domain.
 * 1. Cache first: brand:v2:<domain> (TTL 7 days on write) — saves 20
 *    Context.dev credits per domain.
 * 2. Otherwise Context.dev, two calls (10 credits each):
 *    - brand.retrieve → logos, colors, description, slogan, industry.
 *    - web.extractStyleguide → real site colors, per-element typography,
 *      font files (→ FontLink[]), button styles. BEST-EFFORT: its failure
 *      must not cost the logo (keep the brand.retrieve result).
 * 3. Logo picking: among type:"logo" assets in the right mode, take the
 *    widest aspect ratio (a horizontal lockup almost always contains the
 *    wordmark; ratio ≥ 2.5 → logoHasWordmark). Icon: type:"icon",
 *    preferring multicolor + SVG.
 * 4. CTA color = the styleguide's primary button background when present
 *    (often ≠ accent).
 * Returns null when CONTEXT_DEV_API_KEY is missing or resolution fails.
 */
export async function resolveBrand(_domain: string): Promise<BrandKit | null> {
  throw new Error("Not implemented (B3-WPA)");
}

/**
 * Contract: return sender:brand when it exists; otherwise resolve
 * (SENDER_DOMAIN env, default "pigment.com" — or the domain argument) and
 * store it WITHOUT TTL. Best-effort: null when resolution fails.
 */
export async function ensureSenderBrand(
  _domain?: string,
): Promise<BrandKit | null> {
  throw new Error("Not implemented (B3-WPA)");
}
