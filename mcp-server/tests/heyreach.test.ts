import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mcp = vi.hoisted(() => ({
  connect: vi.fn(),
  callTool: vi.fn(),
  close: vi.fn(),
  transportUrl: undefined as URL | undefined,
}));

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: vi.fn(() => ({
    connect: mcp.connect,
    callTool: mcp.callTool,
    close: mcp.close,
  })),
}));

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: vi.fn((url: URL) => {
    mcp.transportUrl = url;

    return { kind: "streamable-http" };
  }),
}));

import { sendLinkedIn } from "../src/heyreach.js";

const lead = {
  linkedinUrl: "https://www.linkedin.com/in/jane-doe",
  firstName: "Jane",
  lastName: "Doe",
  company: "Acme",
  position: "CTO",
  email: "jane@acme.com",
};

describe("heyreach channel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mcp.transportUrl = undefined;
    mcp.connect.mockResolvedValue(undefined);
    mcp.close.mockResolvedValue(undefined);
    mcp.callTool.mockResolvedValue({ isError: false, content: [] });
    vi.stubEnv("HEYREACH_MCP_URL", "https://mcp.heyreach.io/mcp?xMcpKey=key");
    vi.stubEnv("HEYREACH_CAMPAIGN_ID", "123");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("calls add_leads_to_campaign with an integer id and HeyReach lead shape", async () => {
    await sendLinkedIn(lead);

    expect(mcp.connect).toHaveBeenCalledOnce();
    expect(mcp.callTool).toHaveBeenCalledWith({
      name: "add_leads_to_campaign",
      arguments: {
        campaignId: 123,
        accountLeadPairs: [
          {
            lead: {
              profileUrl: "https://www.linkedin.com/in/jane-doe",
              firstName: "Jane",
              lastName: "Doe",
              companyName: "Acme",
              position: "CTO",
              emailAddress: "jane@acme.com",
            },
          },
        ],
      },
    });
    expect(mcp.transportUrl?.toString()).toBe(
      "https://mcp.heyreach.io/mcp?xMcpKey=key",
    );
    expect(mcp.close).toHaveBeenCalledOnce();
  });

  it("omits optional lead fields that are undefined", async () => {
    await sendLinkedIn({ linkedinUrl: lead.linkedinUrl });

    expect(mcp.callTool).toHaveBeenCalledWith({
      name: "add_leads_to_campaign",
      arguments: {
        campaignId: 123,
        accountLeadPairs: [{ lead: { profileUrl: lead.linkedinUrl } }],
      },
    });
  });

  it("throws when HEYREACH_CAMPAIGN_ID is not an integer", async () => {
    vi.stubEnv("HEYREACH_CAMPAIGN_ID", "camp-abc");

    await expect(sendLinkedIn(lead)).rejects.toThrow(
      /HEYREACH_CAMPAIGN_ID must be an integer/,
    );
    expect(mcp.connect).not.toHaveBeenCalled();
  });

  it("closes the transport even when the tool call throws", async () => {
    mcp.callTool.mockRejectedValue(new Error("boom"));

    await expect(sendLinkedIn(lead)).rejects.toThrow("boom");
    expect(mcp.close).toHaveBeenCalledOnce();
  });

  it("throws when the tool reports isError", async () => {
    mcp.callTool.mockResolvedValue({
      isError: true,
      content: [{ type: "text", text: "campaign not active" }],
    });

    await expect(sendLinkedIn(lead)).rejects.toThrow(
      /add_leads_to_campaign failed/,
    );
    expect(mcp.close).toHaveBeenCalledOnce();
  });

  it("throws without connecting when HEYREACH_MCP_URL is unset", async () => {
    vi.stubEnv("HEYREACH_MCP_URL", "");

    await expect(sendLinkedIn(lead)).rejects.toThrow(/HEYREACH_MCP_URL/);
    expect(mcp.connect).not.toHaveBeenCalled();
  });

  it("throws without connecting when HEYREACH_CAMPAIGN_ID is unset", async () => {
    vi.stubEnv("HEYREACH_CAMPAIGN_ID", "");

    await expect(sendLinkedIn(lead)).rejects.toThrow(/HEYREACH_CAMPAIGN_ID/);
    expect(mcp.connect).not.toHaveBeenCalled();
  });
});
