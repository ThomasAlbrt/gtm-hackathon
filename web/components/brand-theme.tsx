import type { ReactNode } from "react";

import type { BrandKit } from "../lib/contacts";

type BrandThemeProps = {
  /** Brand driving the page theme (the SENDER's brand, not the prospect's). */
  brand?: BrandKit | null;
  children: ReactNode;
};

/**
 * Server-rendered theming wrapper. Contract (implemented in B2-WPA): emits a
 * <style> tag with @font-face rules from brand.fontLinks and a wrapper div
 * carrying the --brand-* CSS variables as inline style — never on :root
 * (neutral defaults live in globals.css). All values pass the lib/brand-css
 * sanitization barrier.
 */
export function BrandTheme({ brand: _brand, children }: BrandThemeProps) {
  return <div data-brand-theme="stub">{children}</div>;
}
