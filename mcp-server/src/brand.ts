import ContextDev from "context.dev";

import {
  brandCacheKey,
  SENDER_BRAND_KEY,
  type BrandKit,
  type FontLink,
} from "./contacts.js";
import { getKv } from "./kv.js";

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
type BrandRetrieveResponse = Awaited<
  ReturnType<ContextDev["brand"]["retrieve"]>
>;
type RetrievedBrand = NonNullable<BrandRetrieveResponse["brand"]>;
type BrandAsset = NonNullable<RetrievedBrand["logos"]>[number];
type BrandColor = NonNullable<RetrievedBrand["colors"]>[number];
type StyleguideResponse = Awaited<
  ReturnType<ContextDev["web"]["extractStyleguide"]>
>;
type Styleguide = NonNullable<StyleguideResponse["styleguide"]>;
type FontFace = {
  fontFamily?: string;
};
type TypographyRecord = {
  body?: FontFace;
  headings?: Record<string, FontFace | undefined>;
  p?: FontFace;
};

const BRAND_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7;

export async function resolveBrand(domain: string): Promise<BrandKit | null> {
  try {
    const normalizedDomain = normalizeDomain(domain);
    if (!normalizedDomain) {
      return null;
    }

    const kv = getKv();
    const cached = await kv.get<BrandKit>(brandCacheKey(normalizedDomain));
    if (cached) {
      return cached;
    }

    const apiKey = process.env.CONTEXT_DEV_API_KEY?.trim();
    if (!apiKey) {
      return null;
    }

    const client = new ContextDev({ apiKey });
    let brandResponse: BrandRetrieveResponse;
    try {
      brandResponse = await client.brand.retrieve({
        domain: normalizedDomain,
        type: "by_domain",
      });
    } catch {
      return null;
    }

    if (!brandResponse.brand) {
      return null;
    }

    let styleguideResponse: StyleguideResponse | undefined;
    try {
      styleguideResponse = await client.web.extractStyleguide({
        domain: normalizedDomain,
      });
    } catch {
      styleguideResponse = undefined;
    }

    const kit = buildBrandKit(
      normalizedDomain,
      brandResponse.brand,
      styleguideResponse?.styleguide,
    );

    await kv.set(brandCacheKey(normalizedDomain), kit, {
      ex: BRAND_CACHE_TTL_SECONDS,
    });

    return kit;
  } catch {
    return null;
  }
}

/**
 * Contract: return sender:brand when it exists; otherwise resolve
 * (SENDER_DOMAIN env, default "pigment.com" — or the domain argument) and
 * store it WITHOUT TTL. Best-effort: null when resolution fails.
 */
export async function ensureSenderBrand(
  domain?: string,
): Promise<BrandKit | null> {
  try {
    const kv = getKv();
    const cached = await kv.get<BrandKit>(SENDER_BRAND_KEY);
    if (cached) {
      return cached;
    }

    const kit = await resolveBrand(
      domain ?? process.env.SENDER_DOMAIN ?? "pigment.com",
    );
    if (kit) {
      await kv.set(SENDER_BRAND_KEY, kit);
    }

    return kit;
  } catch {
    return null;
  }
}

function normalizeDomain(domain: string): string {
  const trimmed = domain.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(
      /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
        ? trimmed
        : `https://${trimmed}`,
    );
    return url.hostname.replace(/\.$/, "");
  } catch {
    return trimmed
      .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
      .split(/[/?#]/, 1)[0]
      .replace(/\.$/, "");
  }
}

function buildBrandKit(
  domain: string,
  brand: RetrievedBrand,
  styleguide?: Styleguide,
): BrandKit {
  const colors = brand.colors ?? [];
  const palette = dedupeColors(colors);
  const styleguideColors = styleguide?.colors;
  const accent =
    colorForRole(colors, "accent") ??
    palette[0] ??
    nonEmptyString(styleguideColors?.accent);
  const background =
    colorForRole(colors, "background") ??
    palette[1] ??
    nonEmptyString(styleguideColors?.background);
  const text =
    colorForRole(colors, "text") ??
    palette[2] ??
    nonEmptyString(styleguideColors?.text);
  const primaryButton = styleguide?.components?.button?.primary;
  const logo = pickLogo(brand.logos ?? []);
  const icon = pickIcon(brand.logos ?? []);
  const typography = styleguide?.typography as TypographyRecord | undefined;
  const headings = typography?.headings;
  const fontHeading = nonEmptyString(headings?.h1?.fontFamily);
  const fontBody = nonEmptyString(
    typography?.body?.fontFamily ?? typography?.p?.fontFamily,
  );
  const fontAccent = pickFontAccent(headings, fontHeading);
  const fontLinks = mapFontLinks(styleguide?.fontLinks);

  const kit: BrandKit = { domain };
  assignIfPresent(kit, "name", brand.title);
  assignIfPresent(kit, "logoUrl", logo?.asset.url);
  if (logo && logo.ratio >= 2.5) {
    kit.logoHasWordmark = true;
  }
  assignIfPresent(kit, "iconUrl", icon?.url);
  assignIfPresent(kit, "accent", accent);
  assignIfPresent(kit, "background", background);
  assignIfPresent(kit, "text", text);
  assignIfPresent(
    kit,
    "cta",
    nonEmptyString(primaryButton?.backgroundColor) ?? accent,
  );
  assignIfPresent(kit, "ctaText", primaryButton?.color);
  if (palette.length > 0) {
    kit.palette = palette.slice(0, 3);
  }
  assignIfPresent(kit, "fontHeading", fontHeading);
  assignIfPresent(kit, "fontBody", fontBody);
  assignIfPresent(kit, "fontAccent", fontAccent);
  if (fontLinks) {
    kit.fontLinks = fontLinks;
  }
  assignIfPresent(kit, "slogan", brand.slogan);
  assignIfPresent(kit, "description", brand.description);

  return kit;
}

function assignIfPresent<Key extends keyof BrandKit>(
  kit: BrandKit,
  key: Key,
  value: BrandKit[Key] | undefined,
): void {
  if (typeof value === "string" && value.trim()) {
    kit[key] = value.trim() as BrandKit[Key];
  }
}

function pickLogo(
  assets: BrandAsset[],
): { asset: BrandAsset; ratio: number } | undefined {
  const logos = assets.filter(
    (asset) => asset.type === "logo" && isNonEmptyString(asset.url),
  );
  const preferredLogos = logos.filter((asset) => isPreferredLogoMode(asset));
  const candidates = preferredLogos.length > 0 ? preferredLogos : logos;
  const widest = candidates.reduce<BrandAsset | undefined>((best, asset) => {
    if (!best) {
      return asset;
    }
    return assetRatio(asset) > assetRatio(best) ? asset : best;
  }, undefined);

  return widest ? { asset: widest, ratio: assetRatio(widest) } : undefined;
}

function pickIcon(assets: BrandAsset[]): BrandAsset | undefined {
  const icons = assets.filter(
    (asset) => asset.type === "icon" && isNonEmptyString(asset.url),
  );

  return icons.reduce<BrandAsset | undefined>((best, asset) => {
    if (!best) {
      return asset;
    }

    const score = iconScore(asset);
    const bestScore = iconScore(best);
    if (score !== bestScore) {
      return score > bestScore ? asset : best;
    }

    return assetArea(asset) > assetArea(best) ? asset : best;
  }, undefined);
}

function isPreferredLogoMode(asset: BrandAsset): boolean {
  return (
    asset.mode === undefined ||
    asset.mode === "light" ||
    asset.mode === "has_opaque_background"
  );
}

function assetRatio(asset: BrandAsset): number {
  const width = asset.resolution?.width;
  const height = asset.resolution?.height;
  if (
    typeof width === "number" &&
    typeof height === "number" &&
    height > 0
  ) {
    return width / height;
  }

  const ratio = asset.resolution?.aspect_ratio;
  return typeof ratio === "number" && Number.isFinite(ratio) ? ratio : 0;
}

function assetArea(asset: BrandAsset): number {
  const width = asset.resolution?.width;
  const height = asset.resolution?.height;
  if (
    typeof width === "number" &&
    typeof height === "number" &&
    width > 0 &&
    height > 0
  ) {
    return width * height;
  }

  return 0;
}

function iconScore(asset: BrandAsset): number {
  return (
    (hasMultipleColors(asset) ? 4 : 0) +
    (isSvgUrl(asset.url) ? 2 : 0) +
    (isPreferredLogoMode(asset) ? 1 : 0)
  );
}

function hasMultipleColors(asset: BrandAsset): boolean {
  const uniqueColors = new Set(
    (asset.colors ?? [])
      .map((color) => color.hex?.trim().toLowerCase())
      .filter(isNonEmptyString),
  );

  return uniqueColors.size > 1;
}

function isSvgUrl(url: string | undefined): boolean {
  return Boolean(
    url?.match(/^data:image\/svg\+xml/i) ?? url?.match(/\.svg(?:[?#]|$)/i),
  );
}

function dedupeColors(colors: BrandColor[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const color of colors) {
    const hex = nonEmptyString(color.hex);
    if (!hex) {
      continue;
    }

    const key = hex.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(hex);
  }

  return deduped.slice(0, 3);
}

function colorForRole(
  colors: BrandColor[],
  role: "accent" | "background" | "text",
): string | undefined {
  const tokensByRole = {
    accent: ["accent", "primary"],
    background: ["background", "bg"],
    text: ["text", "foreground"],
  } satisfies Record<typeof role, string[]>;

  const match = colors.find((color) => {
    const name = color.name?.toLowerCase() ?? "";
    return tokensByRole[role].some((token) => name.includes(token));
  });

  return nonEmptyString(match?.hex);
}

function pickFontAccent(
  headings: Record<string, FontFace | undefined> | undefined,
  fontHeading: string | undefined,
): string | undefined {
  if (!headings || !fontHeading) {
    return undefined;
  }

  const headingKey = normalizeFontFamily(fontHeading);
  for (const level of ["h2", "h3", "h4", "h5", "h6"]) {
    const family = nonEmptyString(headings[level]?.fontFamily);
    if (family && normalizeFontFamily(family) !== headingKey) {
      return family;
    }
  }

  return undefined;
}

function normalizeFontFamily(family: string): string {
  return family.trim().replace(/^["']|["']$/g, "").toLowerCase();
}

function mapFontLinks(
  fontLinks: Styleguide["fontLinks"] | undefined,
): FontLink[] | undefined {
  const mapped: FontLink[] = [];

  for (const [familyKey, link] of Object.entries(fontLinks ?? {})) {
    for (const [fileKey, url] of Object.entries(link.files ?? {})) {
      if (!url.startsWith("https://")) {
        continue;
      }

      const { style, weight } = parseFontFileKey(fileKey);
      const fontLink: FontLink = { family: familyKey, url };
      if (weight) {
        fontLink.weight = weight;
      }
      if (style) {
        fontLink.style = style;
      }
      mapped.push(fontLink);
    }
  }

  return mapped.length > 0 ? mapped : undefined;
}

function parseFontFileKey(fileKey: string): {
  style?: string;
  weight?: string;
} {
  const style = /italic/i.test(fileKey) ? "italic" : undefined;
  const weight = fileKey.match(/\d{3}/)?.[0] ?? (style ? undefined : fileKey);

  return {
    style,
    weight: nonEmptyString(weight),
  };
}

function nonEmptyString(value: string | undefined | null): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
