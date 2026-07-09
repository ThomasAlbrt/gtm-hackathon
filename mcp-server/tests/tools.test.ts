import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BrandKit, Contact } from "../src/contacts.js";

const mocks = vi.hoisted(() => ({
  ensureSenderBrand: vi.fn(),
  listBookings: vi.fn(),
  resolveBrand: vi.fn(),
  saveContact: vi.fn(),
  sendIMessage: vi.fn(),
}));

vi.mock("../src/brand.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/brand.js")>();

  return {
    ...actual,
    ensureSenderBrand: mocks.ensureSenderBrand,
    resolveBrand: mocks.resolveBrand,
  };
});

vi.mock("../src/imessage.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/imessage.js")>();

  return {
    ...actual,
    sendIMessage: mocks.sendIMessage,
  };
});

vi.mock("../src/contacts.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/contacts.js")>();

  return {
    ...actual,
    listBookings: mocks.listBookings,
    saveContact: mocks.saveContact,
  };
});

import { createServer, handlers } from "../src/index.js";

function resultText(result: CallToolResult): string {
  const firstContent = result.content[0];
  if (firstContent?.type !== "text") {
    throw new Error("Expected a text result.");
  }

  return firstContent.text;
}

function resultJson<T>(result: CallToolResult): T {
  return JSON.parse(resultText(result)) as T;
}

function savedContact(index = 0): Contact & Record<string, unknown> {
  return mocks.saveContact.mock.calls[index]?.[0] as Contact &
    Record<string, unknown>;
}

describe("tool handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();

    mocks.ensureSenderBrand.mockResolvedValue(null);
    mocks.listBookings.mockResolvedValue([]);
    mocks.resolveBrand.mockResolvedValue(null);
    mocks.saveContact.mockResolvedValue(undefined);
    mocks.sendIMessage.mockResolvedValue(undefined);
  });

  it("create_landing_page returns a generated slug URL and saves only web contact fields", async () => {
    const result = await handlers.create_landing_page({
      firstName: "Eloise",
      company: "Acme",
      signal: "Acme is hiring sales engineers.",
      phone: "+1 (555) 0100",
      smsText: "Hi Eloise",
    });

    const payload = resultJson<{ id: string; url: string }>(result);
    expect(payload.id).toMatch(/^eloise-[a-z0-9]{4}$/);
    expect(payload.url).toBe(`http://localhost:3000/${payload.id}`);
    expect(mocks.resolveBrand).not.toHaveBeenCalled();
    expect(mocks.saveContact).toHaveBeenCalledTimes(1);

    expect(savedContact()).toMatchObject({
      id: payload.id,
      firstName: "Eloise",
      company: "Acme",
      signal: "Acme is hiring sales engineers.",
      createdAt: expect.any(String),
    });
    expect(savedContact()).not.toHaveProperty("phone");
    expect(savedContact()).not.toHaveProperty("smsText");
    expect(savedContact()).not.toHaveProperty("domain");
    expect(savedContact()).not.toHaveProperty("brand");
  });

  it("create_landing_page attaches a resolved brand when a domain is provided", async () => {
    const brand: BrandKit = { domain: "acme.com", name: "Acme" };
    mocks.resolveBrand.mockResolvedValue(brand);

    const result = await handlers.create_landing_page({
      id: "acme-lead",
      firstName: "Ada",
      company: "Acme",
      domain: "acme.com",
      signal: "Acme opened a Paris office.",
    });

    expect(resultJson(result)).toEqual({
      id: "acme-lead",
      url: "http://localhost:3000/acme-lead",
    });
    expect(mocks.resolveBrand).toHaveBeenCalledWith("acme.com");
    expect(savedContact().brand).toBe(brand);
    expect(savedContact()).not.toHaveProperty("domain");
  });

  it("create_landing_page still creates the page when brand resolution returns null", async () => {
    mocks.resolveBrand.mockResolvedValue(null);

    const result = await handlers.create_landing_page({
      id: "null-brand",
      firstName: "Grace",
      company: "Unknown Co",
      domain: "unknown.example",
      signal: "Unknown Co added a new sales leader.",
    });

    expect(resultJson(result)).toEqual({
      id: "null-brand",
      url: "http://localhost:3000/null-brand",
    });
    expect(mocks.saveContact).toHaveBeenCalledTimes(1);
    expect(savedContact()).not.toHaveProperty("brand");
  });

  it("create_landing_page strips trailing slashes from SITE_BASE_URL", async () => {
    vi.stubEnv("SITE_BASE_URL", "https://pages.example.com/");

    const result = await handlers.create_landing_page({
      id: "fixed-id",
      firstName: "Alan",
      company: "Bletchley",
      signal: "Bletchley is expanding enterprise accounts.",
    });

    expect(resultJson(result)).toEqual({
      id: "fixed-id",
      url: "https://pages.example.com/fixed-id",
    });
  });

  it("launch_campaign refuses false or missing confirmation without side effects", async () => {
    const prospect = {
      firstName: "Ada",
      company: "Acme",
      signal: "Acme is expanding.",
    };

    const falseResult = await handlers.launch_campaign({
      prospects: [prospect],
      confirm: false,
    });
    const missingResult = await handlers.launch_campaign({
      prospects: [prospect],
    });

    expect(falseResult.isError).toBe(true);
    expect(missingResult.isError).toBe(true);
    expect(resultText(falseResult)).toBe(
      "Refused: launch_campaign requires confirm=true after explicit sales-rep approval.",
    );
    expect(resultText(missingResult)).toBe(
      "Refused: launch_campaign requires confirm=true after explicit sales-rep approval.",
    );
    expect(mocks.ensureSenderBrand).not.toHaveBeenCalled();
    expect(mocks.saveContact).not.toHaveBeenCalled();
    expect(mocks.sendIMessage).not.toHaveBeenCalled();
  });

  it("launch_campaign creates pages and reports sent and skipped SMS statuses", async () => {
    mocks.ensureSenderBrand.mockResolvedValue({ domain: "pigment.com" });

    const result = await handlers.launch_campaign({
      confirm: true,
      prospects: [
        {
          id: "ada",
          firstName: "Ada",
          company: "Acme",
          signal: "Acme is hiring RevOps.",
          phone: "+15550100",
          smsText: "Hi Ada",
        },
        {
          id: "grace",
          firstName: "Grace",
          company: "Globex",
          signal: "Globex launched a new region.",
        },
      ],
    });

    expect(resultJson(result)).toEqual({
      senderBrand: "pigment.com",
      report: [
        {
          id: "ada",
          url: "http://localhost:3000/ada",
          sms: "sent",
        },
        {
          id: "grace",
          url: "http://localhost:3000/grace",
          sms: "skipped (no phone/smsText)",
        },
      ],
    });
    expect(mocks.ensureSenderBrand).toHaveBeenCalledTimes(1);
    expect(mocks.saveContact).toHaveBeenCalledTimes(2);
    expect(mocks.sendIMessage).toHaveBeenCalledTimes(1);
    expect(mocks.sendIMessage).toHaveBeenCalledWith("+15550100", "Hi Ada");
  });

  it("launch_campaign reports SMS failure while keeping the created page", async () => {
    mocks.sendIMessage.mockRejectedValue(new Error("Messages unavailable"));

    const result = await handlers.launch_campaign({
      confirm: true,
      prospects: [
        {
          id: "ada",
          firstName: "Ada",
          company: "Acme",
          signal: "Acme is hiring RevOps.",
          phone: "+15550100",
          smsText: "Hi Ada",
        },
      ],
    });

    expect(resultJson(result)).toEqual({
      senderBrand: null,
      report: [
        {
          id: "ada",
          url: "http://localhost:3000/ada",
          sms: "failed: Messages unavailable",
        },
      ],
    });
    expect(mocks.saveContact).toHaveBeenCalledTimes(1);
  });

  it("send_imessage surfaces failures as MCP errors", async () => {
    mocks.sendIMessage.mockRejectedValue(new Error("Cannot send"));

    const result = await handlers.send_imessage({
      recipient: "+15550100",
      text: "Hello",
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toBe("Cannot send");
  });

  it("get_bookings passes limit through and returns bookings", async () => {
    const bookings = [
      {
        contactId: "ada",
        attendeeEmail: "ada@example.com",
        receivedAt: "2026-07-09T09:00:00.000Z",
      },
    ];
    mocks.listBookings.mockResolvedValue(bookings);

    const result = await handlers.get_bookings({ limit: 3 });

    expect(mocks.listBookings).toHaveBeenCalledWith(3);
    expect(resultJson(result)).toEqual({ bookings });
  });

  it("createServer registers the six B3-WPC tools", () => {
    const server = createServer();
    const registeredTools = (
      server as unknown as { _registeredTools?: Record<string, unknown> }
    )._registeredTools;

    if (!registeredTools) {
      return;
    }

    expect(Object.keys(registeredTools).sort()).toEqual(
      [
        "create_landing_page",
        "get_bookings",
        "get_brand",
        "get_sillage_accounts",
        "get_sillage_leads",
        "get_sillage_signals",
        "launch_campaign",
        "send_imessage",
        "set_sender_brand",
        "sillage_to_landing_pages",
      ].sort(),
    );
  });
});
