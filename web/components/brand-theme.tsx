import type { CSSProperties, ReactNode } from "react";

import type { BrandKit } from "../lib/contacts";
import { brandCssVars, fontFaceRules } from "../lib/brand-css";

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
export function BrandTheme({ brand, children }: BrandThemeProps) {
  if (!brand) {
    return <div data-brand-theme="neutral">{children}</div>;
  }

  const fontCss = fontFaceRules(brand.fontLinks);

  return (
    <>
      {fontCss ? <style>{fontCss}</style> : null}
      <div
        data-brand-theme={brand.domain}
        style={brandCssVars(brand) as CSSProperties}
      >
        {children}
      </div>
    </>
  );
}
