import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit-tests the FullEnrich MCP client brick with the SDK Client + transport
 * fully mocked, so nothing touches the network. We assert connect/close
 * lifecycle, tool discovery, argument mapping, and email/phone extraction.
 */
const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  close: vi.fn(),
  listTools: vi.fn(),
  callTool: vi.fn(),
  transportCtor: vi.fn(),
}));

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: vi.fn(() => ({
    connect: mocks.connect,
    close: mocks.close,
    listTools: mocks.listTools,
    callTool: mocks.callTool,
  })),
}));

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: vi.fn((url: URL, opts: unknown) => {
    mocks.transportCtor(url, opts);
    return { url, opts };
  }),
}));

import { enrichContact, resolveEnrichToolName } from "../src/fullenrich.js";

function textResult(payload: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
  };
}

describe("fullenrich brick", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();

    mocks.connect.mockResolvedValue(undefined);
    mocks.close.mockResolvedValue(undefined);
    mocks.listTools.mockResolvedValue({
      tools: [{ name: "search" }, { name: "enrich-contact" }],
    });
    vi.stubEnv("FULLENRICH_MCP_TOKEN", "tok_123");
  });

  it("rejects without a token and never opens a connection", async () => {
    vi.unstubAllEnvs();

    await expect(enrichContact({ firstName: "Ada" })).rejects.toThrow(
      /FULLENRICH_MCP_TOKEN/,
    );
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("sends the bearer token in the Authorization header", async () => {
    mocks.callTool.mockResolvedValue(textResult({}));

    await enrichContact({ firstName: "Ada" });

    const [, opts] = mocks.transportCtor.mock.calls[0] as [URL, unknown];
    expect(opts).toMatchObject({
      requestInit: { headers: { Authorization: "Bearer tok_123" } },
    });
  });

  it("discovers the enrich tool, maps args, and extracts email/phone", async () => {
    mocks.callTool.mockResolvedValue(
      textResult({ data: { work_email: "ada@acme.com", mobile: "+15550100" } }),
    );

    const result = await enrichContact({
      firstName: "Ada",
      lastName: "Lovelace",
      company: "Acme",
      domain: "acme.com",
      linkedinUrl: "https://www.linkedin.com/in/ada",
    });

    expect(mocks.callTool).toHaveBeenCalledWith({
      name: "enrich-contact",
      arguments: {
        firstname: "Ada",
        lastname: "Lovelace",
        company_name: "Acme",
        domain: "acme.com",
        linkedin_url: "https://www.linkedin.com/in/ada",
      },
    });
    expect(result.email).toBe("ada@acme.com");
    expect(result.phone).toBe("+15550100");
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });

  it("resolves with undefined email/phone when FullEnrich finds nothing", async () => {
    mocks.callTool.mockResolvedValue(textResult({ status: "not_found" }));

    const result = await enrichContact({ firstName: "Ada" });

    expect(result.email).toBeUndefined();
    expect(result.phone).toBeUndefined();
    expect(result.raw).toEqual({ status: "not_found" });
  });

  it("closes the transport even when the tool call throws", async () => {
    mocks.callTool.mockRejectedValue(new Error("boom"));

    await expect(enrichContact({ firstName: "Ada" })).rejects.toThrow("boom");
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });

  it("surfaces an MCP tool error", async () => {
    mocks.callTool.mockResolvedValue({
      ...textResult({ message: "quota" }),
      isError: true,
    });

    await expect(enrichContact({ firstName: "Ada" })).rejects.toThrow(
      /FullEnrich enrich-contact failed/,
    );
  });

  describe("resolveEnrichToolName", () => {
    it("finds the first tool mentioning enrich", () => {
      expect(resolveEnrichToolName(["search", "enrich_bulk"])).toBe(
        "enrich_bulk",
      );
    });

    it("honours FULLENRICH_ENRICH_TOOL over discovery", () => {
      vi.stubEnv("FULLENRICH_ENRICH_TOOL", "pinned_tool");
      expect(resolveEnrichToolName(["enrich_bulk"])).toBe("pinned_tool");
    });

    it("throws with the available tools when none match", () => {
      expect(() => resolveEnrichToolName(["search", "export"])).toThrow(
        /search, export/,
      );
    });
  });
});
