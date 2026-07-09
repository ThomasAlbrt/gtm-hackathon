import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BrandKit } from "../src/contacts.js";

const mocks = vi.hoisted(() => ({
  constructed: vi.fn(),
  extractStyleguide: vi.fn(),
  get: vi.fn(),
  retrieve: vi.fn(),
  set: vi.fn(),
}));

vi.mock("../src/kv.js", () => ({
  getKv: () => ({
    get: mocks.get,
    set: mocks.set,
  }),
}));

vi.mock("context.dev", () => ({
  default: class FakeContextDev {
    brand = {
      retrieve: mocks.retrieve,
    };

    web = {
      extractStyleguide: mocks.extractStyleguide,
    };

    constructor(options: unknown) {
      mocks.constructed(options);
    }
  },
}));

const { ensureSenderBrand, resolveBrand } = await import("../src/brand.js");

describe("resolveBrand", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    delete process.env.CONTEXT_DEV_API_KEY;
    delete process.env.SENDER_DOMAIN;
    mocks.constructed.mockReset();
    mocks.extractStyleguide.mockReset();
    mocks.get.mockReset();
    mocks.retrieve.mockReset();
    mocks.set.mockReset();
    mocks.get.mockResolvedValue(null);
    mocks.set.mockResolvedValue("OK");
  });

  it("returns cache hits without calling Context.dev", async () => {
    const cached: BrandKit = {
      domain: "stripe.com",
      name: "Cached Stripe",
    };
    mocks.get.mockResolvedValueOnce(cached);

    const result = await resolveBrand(" HTTPS://Stripe.com/docs ");

    expect(result).toBe(cached);
    expect(mocks.get).toHaveBeenCalledWith("brand:v2:stripe.com");
    expect(mocks.constructed).not.toHaveBeenCalled();
    expect(mocks.retrieve).not.toHaveBeenCalled();
    expect(mocks.extractStyleguide).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("returns null without an API key and does not call Context.dev", async () => {
    vi.stubEnv("CONTEXT_DEV_API_KEY", "");

    const result = await resolveBrand("stripe.com");

    expect(result).toBeNull();
    expect(mocks.get).toHaveBeenCalledWith("brand:v2:stripe.com");
    expect(mocks.constructed).not.toHaveBeenCalled();
    expect(mocks.retrieve).not.toHaveBeenCalled();
    expect(mocks.extractStyleguide).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("returns a kit and caches it when retrieve succeeds but styleguide throws", async () => {
    vi.stubEnv("CONTEXT_DEV_API_KEY", "test-key");
    mocks.retrieve.mockResolvedValueOnce({
      brand: {
        colors: [
          { hex: "#635BFF", name: "Accent" },
          { hex: "#FFFFFF", name: "Background" },
          { hex: "#0A2540", name: "Text" },
        ],
        description: "Financial infrastructure for the internet.",
        domain: "stripe.com",
        logos: [
          {
            mode: "light",
            resolution: { height: 60, width: 300 },
            type: "logo",
            url: "https://cdn.example.com/stripe-logo.svg",
          },
          {
            colors: [{ hex: "#635BFF" }, { hex: "#0A2540" }],
            resolution: { height: 64, width: 64 },
            type: "icon",
            url: "https://cdn.example.com/stripe-icon.svg",
          },
        ],
        slogan: "Payments infrastructure",
        title: "Stripe",
      },
    });
    mocks.extractStyleguide.mockRejectedValueOnce(new Error("styleguide down"));

    const result = await resolveBrand("stripe.com");

    expect(result).toMatchObject({
      accent: "#635BFF",
      background: "#FFFFFF",
      cta: "#635BFF",
      description: "Financial infrastructure for the internet.",
      domain: "stripe.com",
      iconUrl: "https://cdn.example.com/stripe-icon.svg",
      logoHasWordmark: true,
      logoUrl: "https://cdn.example.com/stripe-logo.svg",
      name: "Stripe",
      palette: ["#635BFF", "#FFFFFF", "#0A2540"],
      slogan: "Payments infrastructure",
      text: "#0A2540",
    });
    expect(result?.fontLinks).toBeUndefined();
    expect(mocks.retrieve).toHaveBeenCalledWith({
      domain: "stripe.com",
      type: "by_domain",
    });
    expect(mocks.extractStyleguide).toHaveBeenCalledWith({
      domain: "stripe.com",
    });
    expect(mocks.set).toHaveBeenCalledWith("brand:v2:stripe.com", result, {
      ex: 604800,
    });
  });

  it("returns null and skips cache writes when retrieve throws", async () => {
    vi.stubEnv("CONTEXT_DEV_API_KEY", "test-key");
    mocks.retrieve.mockRejectedValueOnce(new Error("retrieve down"));

    const result = await resolveBrand("stripe.com");

    expect(result).toBeNull();
    expect(mocks.extractStyleguide).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("sets logoHasWordmark only for logos with a wide aspect ratio", async () => {
    vi.stubEnv("CONTEXT_DEV_API_KEY", "test-key");
    mocks.extractStyleguide.mockResolvedValue({});
    mocks.retrieve
      .mockResolvedValueOnce({
        brand: {
          logos: [
            {
              resolution: { height: 60, width: 300 },
              type: "logo",
              url: "https://cdn.example.com/wide.svg",
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        brand: {
          logos: [
            {
              resolution: { height: 90, width: 100 },
              type: "logo",
              url: "https://cdn.example.com/square.svg",
            },
          ],
        },
      });

    const wide = await resolveBrand("wide.example");
    const square = await resolveBrand("square.example");

    expect(wide?.logoHasWordmark).toBe(true);
    expect(square?.logoHasWordmark).not.toBe(true);
  });

  it("uses styleguide primary button colors for CTA over the accent fallback", async () => {
    vi.stubEnv("CONTEXT_DEV_API_KEY", "test-key");
    mocks.retrieve.mockResolvedValueOnce({
      brand: {
        colors: [{ hex: "#000000", name: "Accent" }],
      },
    });
    mocks.extractStyleguide.mockResolvedValueOnce({
      styleguide: {
        components: {
          button: {
            primary: {
              backgroundColor: "#020D23",
              color: "#FFFFFF",
            },
          },
        },
        typography: {
          headings: {},
        },
      },
    });

    const result = await resolveBrand("pigment.com");

    expect(result).toMatchObject({
      accent: "#000000",
      cta: "#020D23",
      ctaText: "#FFFFFF",
    });
  });

  it("picks fontAccent from the first h2..h6 family differing from h1", async () => {
    vi.stubEnv("CONTEXT_DEV_API_KEY", "test-key");
    mocks.retrieve.mockResolvedValueOnce({
      brand: {
        colors: [{ hex: "#111111", name: "Accent" }],
      },
    });
    mocks.extractStyleguide.mockResolvedValueOnce({
      styleguide: {
        fontLinks: {
          Inter: {
            files: {
              "400": "https://fonts.example.com/inter-400.woff2",
              "700italic": "https://fonts.example.com/inter-700-italic.woff2",
              "900": "http://fonts.example.com/inter-900.woff2",
            },
          },
        },
        typography: {
          headings: {
            h1: { fontFamily: "Inter" },
            h2: { fontFamily: "Inter" },
            h3: { fontFamily: "Editorial Serif" },
          },
          p: { fontFamily: "Body Sans" },
        },
      },
    });

    const result = await resolveBrand("fonts.example");

    expect(result).toMatchObject({
      fontAccent: "Editorial Serif",
      fontBody: "Body Sans",
      fontHeading: "Inter",
      fontLinks: [
        {
          family: "Inter",
          url: "https://fonts.example.com/inter-400.woff2",
          weight: "400",
        },
        {
          family: "Inter",
          style: "italic",
          url: "https://fonts.example.com/inter-700-italic.woff2",
          weight: "700",
        },
      ],
    });
  });

  it("omits fontAccent when h2..h6 match h1", async () => {
    vi.stubEnv("CONTEXT_DEV_API_KEY", "test-key");
    mocks.retrieve.mockResolvedValueOnce({
      brand: {
        colors: [{ hex: "#111111", name: "Accent" }],
      },
    });
    mocks.extractStyleguide.mockResolvedValueOnce({
      styleguide: {
        typography: {
          headings: {
            h1: { fontFamily: "Inter" },
            h2: { fontFamily: "Inter" },
            h3: { fontFamily: "Inter" },
          },
        },
      },
    });

    const result = await resolveBrand("same-fonts.example");

    expect(result?.fontAccent).toBeUndefined();
  });
});

describe("ensureSenderBrand", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    delete process.env.CONTEXT_DEV_API_KEY;
    delete process.env.SENDER_DOMAIN;
    mocks.constructed.mockReset();
    mocks.extractStyleguide.mockReset();
    mocks.get.mockReset();
    mocks.retrieve.mockReset();
    mocks.set.mockReset();
    mocks.set.mockResolvedValue("OK");
  });

  it("returns an existing sender brand without resolving", async () => {
    const cached: BrandKit = {
      domain: "sender.example",
      name: "Sender",
    };
    mocks.get.mockResolvedValueOnce(cached);

    const result = await ensureSenderBrand();

    expect(result).toBe(cached);
    expect(mocks.get).toHaveBeenCalledWith("sender:brand");
    expect(mocks.constructed).not.toHaveBeenCalled();
    expect(mocks.retrieve).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("resolves pigment.com by default and stores sender brand without TTL", async () => {
    vi.stubEnv("CONTEXT_DEV_API_KEY", "test-key");
    mocks.get.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    mocks.retrieve.mockResolvedValueOnce({
      brand: {
        colors: [{ hex: "#000000", name: "Accent" }],
        domain: "pigment.com",
        title: "Pigment",
      },
    });
    mocks.extractStyleguide.mockResolvedValueOnce({});

    const result = await ensureSenderBrand();

    expect(result).toMatchObject({
      domain: "pigment.com",
      name: "Pigment",
    });
    expect(mocks.retrieve).toHaveBeenCalledWith({
      domain: "pigment.com",
      type: "by_domain",
    });
    expect(mocks.set).toHaveBeenCalledWith("brand:v2:pigment.com", result, {
      ex: 604800,
    });
    expect(mocks.set).toHaveBeenCalledWith("sender:brand", result);
    const senderSet = mocks.set.mock.calls.find(
      ([key]) => key === "sender:brand",
    );
    expect(senderSet).toHaveLength(2);
  });
});
