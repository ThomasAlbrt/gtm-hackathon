/**
 * Outbound iMessage via Messages.app on macOS (osascript).
 *
 * SECURITY INVARIANT: recipient and text travel as ARGV of an
 * `on run argv` AppleScript — they are NEVER interpolated into the
 * AppleScript source (injection barrier; preserve). First send triggers a
 * macOS Automation permission prompt for the host app.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const SCRIPT = `on run argv
  set target to item 1 of argv
  set msg to item 2 of argv
  tell application "Messages"
    set svc to 1st account whose service type = iMessage
    set b to participant target of svc
    send msg to b
  end tell
end run`;

const execFileAsync = promisify(execFile);

/**
 * Contract: an email passes through unchanged; anything else is treated as a
 * phone number and stripped to quasi-E.164 (keep leading +, drop spaces,
 * dots, dashes, parentheses).
 */
export function normalizeRecipient(recipient: string): string {
  const trimmed = recipient.trim();

  if (trimmed.includes("@")) {
    return trimmed;
  }

  const digits = trimmed.replace(/\D/g, "");

  if (digits.length === 0) {
    throw new Error("Recipient phone number must contain at least one digit");
  }

  return `${trimmed.startsWith("+") ? "+" : ""}${digits}`;
}

/**
 * Contract: send `text` to `recipient` through Messages.app. Rejects with a
 * clear error when not on macOS or when osascript is unavailable. Resolves
 * on send.
 */
export async function sendIMessage(
  recipient: string,
  text: string,
): Promise<void> {
  if (process.platform !== "darwin") {
    throw new Error("iMessage sending requires macOS (Messages.app)…");
  }

  const normalizedRecipient = normalizeRecipient(recipient);

  try {
    await execFileAsync("osascript", ["-e", SCRIPT, normalizedRecipient, text]);
  } catch (error) {
    throw new Error(
      `Failed to send iMessage via osascript: ${errorMessage(error)}`,
    );
  }
}

function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "stderr" in error) {
    const stderr = String(error.stderr).trim();

    if (stderr.length > 0) {
      return stderr;
    }
  }

  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return "unknown error";
}
