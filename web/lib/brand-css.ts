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
export function sanitizeHexColor(value?: string): string | undefined {
  return value && /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : undefined;
}

/**
 * Contract: return the value when it matches /^[a-zA-Z0-9 _-]+$/ (a safe CSS
 * font family name), undefined otherwise.
 */
export function sanitizeFontFamily(value?: string): string | undefined {
  return value && /^[a-zA-Z0-9 _-]+$/.test(value) ? value : undefined;
}

/**
 * Contract: build @font-face rules for the given links. Skip any link whose
 * family fails sanitizeFontFamily or whose url is not https. Weight only when
 * it matches /^[1-9]00$/; style only "normal" | "italic". format() mapped from
 * the file extension (woff2/woff/ttf → "truetype"/otf → "opentype"); omit
 * format() for unknown extensions. Always font-display: swap. Returns "" for
 * missing/empty input.
 */
export function fontFaceRules(links?: FontLink[]): string {
  if (!links?.length) {
    return "";
  }

  return links
    .map((link) => {
      const family = sanitizeFontFamily(link.family);
      const url = sanitizeFontUrl(link.url);

      if (!family || !url) {
        return "";
      }

      const format = fontFormatFromUrl(url);
      const formatClause = format ? ` format("${format}")` : "";
      const weightClause = /^[1-9]00$/.test(link.weight ?? "")
        ? `font-weight:${link.weight};`
        : "";
      const styleClause =
        link.style === "normal" || link.style === "italic"
          ? `font-style:${link.style};`
          : "";

      return `@font-face{font-family:"${family}";src:url(${url})${formatClause};font-display:swap;${weightClause}${styleClause}}`;
    })
    .join("");
}

/**
 * Contract: map a BrandKit to CSS custom properties. Keys emitted (only when
 * the source value exists AND passes its sanitizer): --brand-accent,
 * --brand-background, --brand-text, --brand-cta, --brand-cta-text,
 * --brand-palette-1..3 (first three palette entries), --brand-font-heading,
 * --brand-font-body, --brand-font-accent. Returns {} for null/undefined brand.
 */
export function brandCssVars(brand?: BrandKit | null): Record<string, string> {
  if (!brand) {
    return {};
  }

  const vars: Record<string, string> = {};

  setIfValid(vars, "--brand-accent", sanitizeHexColor(brand.accent));
  setIfValid(vars, "--brand-background", sanitizeHexColor(brand.background));
  setIfValid(vars, "--brand-text", sanitizeHexColor(brand.text));
  setIfValid(vars, "--brand-cta", sanitizeHexColor(brand.cta));
  setIfValid(vars, "--brand-cta-text", sanitizeHexColor(brand.ctaText));

  brand.palette?.slice(0, 3).forEach((color, index) => {
    setIfValid(
      vars,
      `--brand-palette-${index + 1}`,
      sanitizeHexColor(color),
    );
  });

  setIfValid(
    vars,
    "--brand-font-heading",
    sanitizeFontFamily(brand.fontHeading),
  );
  setIfValid(vars, "--brand-font-body", sanitizeFontFamily(brand.fontBody));
  setIfValid(
    vars,
    "--brand-font-accent",
    sanitizeFontFamily(brand.fontAccent),
  );

  return vars;
}

function sanitizeFontUrl(value: string): string | undefined {
  if (!value.startsWith("https://")) {
    return undefined;
  }

  return /["'\\()\s]/.test(value) ? undefined : value;
}

function fontFormatFromUrl(value: string): string | undefined {
  const withoutQueryOrFragment = value.split(/[?#]/, 1)[0];
  const extension = withoutQueryOrFragment.match(/\.([a-zA-Z0-9]+)$/)?.[1];

  switch (extension?.toLowerCase()) {
    case "woff2":
      return "woff2";
    case "woff":
      return "woff";
    case "ttf":
      return "truetype";
    case "otf":
      return "opentype";
    default:
      return undefined;
  }
}

function setIfValid(
  vars: Record<string, string>,
  key: string,
  value: string | undefined,
): void {
  if (value) {
    vars[key] = value;
  }
}
