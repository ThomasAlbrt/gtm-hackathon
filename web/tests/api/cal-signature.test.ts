import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { verifyCalSignature } from "../../lib/cal-signature";

function sign(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

describe("verifyCalSignature", () => {
  it("accepts a valid signature", () => {
    const rawBody = JSON.stringify({ hello: "world" });
    const secret = "cal-secret";

    expect(verifyCalSignature(rawBody, sign(rawBody, secret), secret)).toBe(
      true,
    );
  });

  it("rejects a signature for a tampered body", () => {
    const rawBody = JSON.stringify({ hello: "world" });
    const secret = "cal-secret";
    const signature = sign(rawBody, secret);

    expect(
      verifyCalSignature(JSON.stringify({ hello: "tampered" }), signature, secret),
    ).toBe(false);
  });

  it("rejects a wrong-length header without throwing", () => {
    expect(verifyCalSignature("body", "abc", "cal-secret")).toBe(false);
  });

  it("rejects a null header", () => {
    expect(verifyCalSignature("body", null, "cal-secret")).toBe(false);
  });

  it("accepts a sha256-prefixed valid signature", () => {
    const rawBody = JSON.stringify({ hello: "world" });
    const secret = "cal-secret";

    expect(
      verifyCalSignature(rawBody, `sha256=${sign(rawBody, secret)}`, secret),
    ).toBe(true);
  });

  it("disables verification when the secret is undefined", () => {
    expect(verifyCalSignature("body", null, undefined)).toBe(true);
  });

  it("disables verification when the secret is an empty string", () => {
    expect(verifyCalSignature("body", null, "")).toBe(true);
  });
});
