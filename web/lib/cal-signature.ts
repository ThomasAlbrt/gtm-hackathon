import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Contract: verify the x-cal-signature-256 header using an HMAC sha256 of the
 * raw body and timingSafeEqual. When secret is undefined or empty, verification
 * is disabled and returns true.
 */
export function verifyCalSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined,
): boolean {
  if (!secret) {
    return true;
  }

  if (!signatureHeader) {
    return false;
  }

  const signature = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice("sha256=".length)
    : signatureHeader;

  const expectedSignature = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  if (signature.length !== expectedSignature.length) {
    return false;
  }

  const signatureBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  if (signatureBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(signatureBuffer, expectedBuffer);
}
