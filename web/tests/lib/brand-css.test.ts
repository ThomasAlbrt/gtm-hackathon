import { describe, expect, it } from "vitest";

import {
  brandCssVars,
  fontFaceRules,
  sanitizeFontFamily,
  sanitizeHexColor,
} from "../../lib/brand-css";
import type { BrandKit, FontLink } from "../../lib/contacts";

describe("brand css", () => {
  describe("sanitizeHexColor", () => {
    it("returns strict hex color values", () => {
      expect(sanitizeHexColor("#fff")).toBe("#fff");
      expect(sanitizeHexColor("#A1B2C3")).toBe("#A1B2C3");
      expect(sanitizeHexColor("#a1b2c3d4")).toBe("#a1b2c3d4");
    });

    it("rejects non-hex color values", () => {
      expect(sanitizeHexColor("red")).toBeUndefined();
      expect(sanitizeHexColor("#ggg")).toBeUndefined();
      expect(sanitizeHexColor("#12")).toBeUndefined();
      expect(sanitizeHexColor("url(x)")).toBeUndefined();
      expect(sanitizeHexColor(undefined)).toBeUndefined();
    });
  });

  describe("sanitizeFontFamily", () => {
    it("returns safe font family values", () => {
      expect(sanitizeFontFamily("Inter")).toBe("Inter");
      expect(sanitizeFontFamily("Roboto Mono 2")).toBe("Roboto Mono 2");
      expect(sanitizeFontFamily("a_b-c")).toBe("a_b-c");
    });

    it("rejects unsafe font family values", () => {
      expect(sanitizeFontFamily('"; } body{background:red} ')).toBeUndefined();
      expect(sanitizeFontFamily("Inter,serif")).toBeUndefined();
      expect(sanitizeFontFamily("a'b")).toBeUndefined();
      expect(sanitizeFontFamily(undefined)).toBeUndefined();
    });
  });

  describe("fontFaceRules", () => {
    it("emits a valid woff2 font face rule", () => {
      const output = fontFaceRules([
        {
          family: "Inter",
          url: "https://cdn.example.com/inter.woff2",
        },
      ]);

      expect(output).toContain('font-family:"Inter"');
      expect(output).toContain("url(https://cdn.example.com/inter.woff2)");
      expect(output).toContain('format("woff2")');
      expect(output).toContain("font-display:swap");
    });

    it("skips non-https and escapable urls", () => {
      const links: FontLink[] = [
        {
          family: "Inter",
          url: "http://cdn.example.com/inter.woff2",
        },
        {
          family: "Inter",
          url: "https://cdn.example.com/inter).woff2",
        },
        {
          family: "Inter",
          url: "https://cdn.example.com/inter font.woff2",
        },
      ];

      expect(fontFaceRules(links)).toBe("");
    });

    it("keeps only valid weight values", () => {
      const output = fontFaceRules([
        {
          family: "Inter",
          url: "https://cdn.example.com/regular.woff2",
          weight: "400",
        },
        {
          family: "Inter",
          url: "https://cdn.example.com/near-bold.woff2",
          weight: "950",
        },
        {
          family: "Inter",
          url: "https://cdn.example.com/invalid.woff2",
          weight: "abc",
        },
      ]);

      expect(output).toContain("font-weight:400");
      expect(output).not.toContain("font-weight:950");
      expect(output).not.toContain("font-weight:abc");
    });

    it("keeps only normal or italic style values", () => {
      const output = fontFaceRules([
        {
          family: "Inter",
          url: "https://cdn.example.com/italic.woff2",
          style: "italic",
        },
        {
          family: "Inter",
          url: "https://cdn.example.com/oblique.woff2",
          style: "oblique",
        },
      ]);

      expect(output).toContain("font-style:italic");
      expect(output).not.toContain("font-style:oblique");
    });

    it("omits format for unknown file extensions", () => {
      const output = fontFaceRules([
        {
          family: "Inter",
          url: "https://cdn.example.com/inter.bin",
        },
      ]);

      expect(output).toContain("src:url(https://cdn.example.com/inter.bin);");
      expect(output).not.toContain("format(");
    });

    it("detects woff2 extensions before query strings", () => {
      const output = fontFaceRules([
        {
          family: "Inter",
          url: "https://cdn.example.com/inter.woff2?v=3",
        },
      ]);

      expect(output).toContain('format("woff2")');
    });

    it("returns an empty string for empty or missing input", () => {
      expect(fontFaceRules([])).toBe("");
      expect(fontFaceRules(undefined)).toBe("");
    });
  });

  describe("brandCssVars", () => {
    it("maps a full valid brand kit", () => {
      const brand: BrandKit = {
        domain: "example.com",
        accent: "#111111",
        background: "#222222",
        text: "#333333",
        cta: "#444444",
        ctaText: "#555555",
        palette: ["#666666", "#777777", "#888888"],
        fontHeading: "Inter",
        fontBody: "Roboto Mono 2",
        fontAccent: "a_b-c",
      };

      expect(brandCssVars(brand)).toEqual({
        "--brand-accent": "#111111",
        "--brand-background": "#222222",
        "--brand-text": "#333333",
        "--brand-cta": "#444444",
        "--brand-cta-text": "#555555",
        "--brand-palette-1": "#666666",
        "--brand-palette-2": "#777777",
        "--brand-palette-3": "#888888",
        "--brand-font-heading": "Inter",
        "--brand-font-body": "Roboto Mono 2",
        "--brand-font-accent": "a_b-c",
      });
    });

    it("drops invalid values individually", () => {
      expect(
        brandCssVars({
          domain: "example.com",
          accent: "red",
          background: "#fff",
        }),
      ).toEqual({
        "--brand-background": "#fff",
      });
    });

    it("maps only present palette entries", () => {
      expect(
        brandCssVars({
          domain: "example.com",
          palette: ["#111", "#222"],
        }),
      ).toEqual({
        "--brand-palette-1": "#111",
        "--brand-palette-2": "#222",
      });
    });

    it("returns an empty object for null input", () => {
      expect(brandCssVars(null)).toEqual({});
    });
  });
});
