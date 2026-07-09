import { afterEach, describe, expect, it, vi } from "vitest";

type ExecFileCallback = (
  error: Error | null,
  stdout: string,
  stderr: string,
) => void;

const { execFileMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

import { normalizeRecipient, sendIMessage } from "../src/imessage.js";

const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");

function stubPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    configurable: true,
    value: platform,
  });
}

afterEach(() => {
  execFileMock.mockReset();

  if (platformDescriptor) {
    Object.defineProperty(process, "platform", platformDescriptor);
  }
});

describe("normalizeRecipient", () => {
  it("passes emails through with trim", () => {
    expect(normalizeRecipient("  hello@example.com  ")).toBe(
      "hello@example.com",
    );
  });

  it("normalizes an international phone number", () => {
    expect(normalizeRecipient("+33 6 12.34-56(78)")).toBe("+33612345678");
  });

  it("normalizes a local phone number", () => {
    expect(normalizeRecipient("06 12 34 56 78")).toBe("0612345678");
  });

  it("rejects phone-like input with no digits", () => {
    expect(() => normalizeRecipient("abc")).toThrow(
      "Recipient phone number must contain at least one digit",
    );
  });
});

describe("sendIMessage", () => {
  it("rejects before spawning outside macOS", async () => {
    stubPlatform("linux");

    await expect(sendIMessage("+33612345678", "hello")).rejects.toThrow(
      "iMessage sending requires macOS (Messages.app)…",
    );
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it("sends recipient and text only through argv", async () => {
    stubPlatform("darwin");
    const maliciousText = '"; do shell script \\"rm -rf ~\\"';
    execFileMock.mockImplementation(
      (_file: string, _args: string[], callback: ExecFileCallback) => {
        callback(null, "", "");
      },
    );

    await sendIMessage("+33 6 12.34-56(78)", maliciousText);

    expect(execFileMock).toHaveBeenCalledTimes(1);
    const [file, args] = execFileMock.mock.calls[0] as [
      string,
      string[],
      ExecFileCallback,
    ];
    const script = args[1];

    expect(file).toBe("osascript");
    expect(args).toEqual(["-e", script, "+33612345678", maliciousText]);
    expect(script).toContain("on run argv");
    expect(script).not.toContain("+33612345678");
    expect(script).not.toContain(maliciousText);
    expect(args[3]).toBe(maliciousText);
  });

  it("wraps execFile errors", async () => {
    stubPlatform("darwin");
    const error = Object.assign(new Error("osascript failed"), {
      stderr: "Messages could not send",
    });
    execFileMock.mockImplementation(
      (_file: string, _args: string[], callback: ExecFileCallback) => {
        callback(error, "", "Messages could not send");
      },
    );

    await expect(sendIMessage("+33612345678", "hello")).rejects.toThrow(
      "Failed to send iMessage via osascript: Messages could not send",
    );
  });
});
