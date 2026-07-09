/**
 * Outbound iMessage via Messages.app on macOS (osascript).
 *
 * SECURITY INVARIANT: recipient and text travel as ARGV of an
 * `on run argv` AppleScript — they are NEVER interpolated into the
 * AppleScript source (injection barrier; preserve). First send triggers a
 * macOS Automation permission prompt for the host app.
 */

/**
 * Contract: an email passes through unchanged; anything else is treated as a
 * phone number and stripped to quasi-E.164 (keep leading +, drop spaces,
 * dots, dashes, parentheses).
 */
export function normalizeRecipient(_recipient: string): string {
  throw new Error("Not implemented (B3-WPB)");
}

/**
 * Contract: send `text` to `recipient` through Messages.app. Rejects with a
 * clear error when not on macOS or when osascript is unavailable. Resolves
 * on send.
 */
export async function sendIMessage(
  _recipient: string,
  _text: string,
): Promise<void> {
  throw new Error("Not implemented (B3-WPB)");
}
