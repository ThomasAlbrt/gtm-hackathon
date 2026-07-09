/* eslint-disable @typescript-eslint/no-unused-vars -- WP0 freezes this stub signature before WP2 implementation. */

/**
 * Contract: verify the x-cal-signature-256 header using an HMAC sha256 of the
 * raw body and timingSafeEqual. When secret is undefined or empty, verification
 * is disabled and returns true.
 */
export function verifyCalSignature(
  _rawBody: string,
  _signatureHeader: string | null,
  _secret: string | undefined,
): boolean {
  throw new Error("Not implemented (WP2)");
}
