/**
 * Contact enrichment via FullEnrich, reached over MCP.
 *
 * FullEnrich exposes its own hosted MCP server; this module acts as an MCP
 * CLIENT to it. "Enriching a contact" means asking FullEnrich to find a
 * prospect's professional email and/or phone number from their name + company
 * (or LinkedIn URL). FullEnrich owns the waterfall of data providers, not us.
 *
 * Auth: FullEnrich's MCP is normally connected through a browser OAuth flow
 * (see help.fullenrich.com). A headless MCP client cannot run that flow, so we
 * send a bearer token in the Authorization header instead — the token you get
 * from FullEnrich (OAuth access token or API key). This mirrors how the
 * HeyReach brick embeds its key: a secret carried on every request, no browser.
 *
 * Env (read at call time, never at import — keeps builds/tests green without it):
 *   FULLENRICH_MCP_URL    MCP endpoint URL. Defaults to the hosted endpoint.
 *   FULLENRICH_MCP_TOKEN  bearer token for the Authorization header. Secret.
 *   FULLENRICH_ENRICH_TOOL  optional: pin the enrichment tool name instead of
 *                           discovering it (see resolveEnrichToolName).
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/** The hosted FullEnrich MCP endpoint (overridable via FULLENRICH_MCP_URL). */
const DEFAULT_MCP_URL = "https://mcp.fullenrich.com/mcp";

/**
 * A prospect to enrich. Name is required; the rest narrows the search so
 * FullEnrich returns the right person. A LinkedIn URL alone is often enough.
 */
export type EnrichInput = {
  firstName: string;
  lastName?: string;
  /** Company name, e.g. "Acme". */
  company?: string;
  /** Company domain, e.g. "acme.com" — the strongest disambiguator. */
  domain?: string;
  /** LinkedIn profile URL, e.g. https://www.linkedin.com/in/jane-doe. */
  linkedinUrl?: string;
};

/**
 * What we surface from an enrichment. `email`/`phone` are best-effort extracts;
 * `raw` is the full tool payload so callers can read fields we don't model.
 */
export type EnrichmentResult = {
  email?: string;
  phone?: string;
  raw: unknown;
};

/**
 * Contract: run `fn` against a connected FullEnrich MCP client, always closing
 * the transport afterwards. Connection is per call rather than a singleton,
 * which would go stale between invocations. Rejects with a clear error when
 * FULLENRICH_MCP_TOKEN is unset.
 */
async function withFullenrichClient<T>(
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const token = process.env.FULLENRICH_MCP_TOKEN;

  if (!token) {
    throw new Error(
      "FullEnrich enrichment requires FULLENRICH_MCP_TOKEN (a bearer token from your FullEnrich account).",
    );
  }

  const url = process.env.FULLENRICH_MCP_URL ?? DEFAULT_MCP_URL;

  const client = new Client({ name: "gtm-campaign", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: {
      headers: { Authorization: `Bearer ${token}` },
    },
  });

  try {
    await client.connect(transport);

    return await fn(client);
  } finally {
    await client.close();
  }
}

/**
 * Pick the enrichment tool to call. FullEnrich does not publish stable tool
 * names, so — unless FULLENRICH_ENRICH_TOOL pins one — we discover it at
 * runtime: the first tool whose name mentions "enrich". Throws with the list of
 * available tools when nothing matches, which makes a wrong endpoint obvious.
 */
export function resolveEnrichToolName(toolNames: string[]): string {
  const pinned = process.env.FULLENRICH_ENRICH_TOOL;
  if (pinned) {
    return pinned;
  }

  const match = toolNames.find((name) => /enrich/i.test(name));
  if (!match) {
    throw new Error(
      `FullEnrich exposed no enrichment tool. Available tools: ${
        toolNames.length > 0 ? toolNames.join(", ") : "(none)"
      }. Pin one with FULLENRICH_ENRICH_TOOL.`,
    );
  }

  return match;
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /\+?[0-9][0-9().\-\s]{6,}[0-9]/;

/**
 * Walk an arbitrary JSON value and return the first string matching `re`.
 * FullEnrich's exact payload shape is not contractual, so we scan rather than
 * bind to specific keys — good enough to lift out an email or phone.
 */
function firstMatch(value: unknown, re: RegExp): string | undefined {
  if (typeof value === "string") {
    return re.exec(value)?.[0];
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstMatch(item, re);
      if (found) return found;
    }
    return undefined;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      const found = firstMatch(item, re);
      if (found) return found;
    }
  }
  return undefined;
}

/** Pull the text of a CallToolResult and JSON-parse it, falling back to text. */
function decodePayload(result: CallToolResult): unknown {
  const text = result.content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Contract: enrich one prospect through FullEnrich's MCP and return the
 * best-effort email/phone plus the raw payload. Resolves even when FullEnrich
 * finds nothing (email/phone simply undefined); rejects with a clear error when
 * env is missing, no enrichment tool exists, or the MCP tool reports an error.
 */
export async function enrichContact(
  input: EnrichInput,
): Promise<EnrichmentResult> {
  return withFullenrichClient(async (client) => {
    const { tools } = await client.listTools();
    const toolName = resolveEnrichToolName(tools.map((tool) => tool.name));

    const result = (await client.callTool({
      name: toolName,
      arguments: {
        firstname: input.firstName,
        ...(input.lastName !== undefined ? { lastname: input.lastName } : {}),
        ...(input.company !== undefined
          ? { company_name: input.company }
          : {}),
        ...(input.domain !== undefined ? { domain: input.domain } : {}),
        ...(input.linkedinUrl !== undefined
          ? { linkedin_url: input.linkedinUrl }
          : {}),
      },
    })) as CallToolResult;

    if (result.isError) {
      throw new Error(
        `FullEnrich ${toolName} failed: ${JSON.stringify(result.content)}`,
      );
    }

    const raw = decodePayload(result);

    return {
      raw,
      ...(firstMatch(raw, EMAIL_RE) !== undefined
        ? { email: firstMatch(raw, EMAIL_RE) }
        : {}),
      ...(firstMatch(raw, PHONE_RE) !== undefined
        ? { phone: firstMatch(raw, PHONE_RE) }
        : {}),
    };
  });
}
