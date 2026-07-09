/**
 * Outbound LinkedIn via HeyReach, reached over MCP.
 *
 * HeyReach exposes its own hosted MCP server; this module acts as an MCP
 * CLIENT to it. "Sending a LinkedIn message" means enrolling the prospect as a
 * lead in a pre-configured HeyReach campaign (HEYREACH_CAMPAIGN_ID), which then
 * runs its connect + message sequence — HeyReach owns the message copy, not us.
 *
 * Env (read at call time, never at import — keeps builds/tests green without it):
 *   HEYREACH_MCP_URL      full MCP endpoint URL, including the ?xMcpKey=… query
 *   HEYREACH_CAMPAIGN_ID  id of an ACTIVE campaign with a LinkedIn sender
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

/**
 * A single LinkedIn prospect pushed into a HeyReach campaign. Only the profile
 * URL is required; the rest enriches the lead. Mirrors the `leads` object of
 * HeyReach's `add-leads-to-campaign` tool.
 */
export type LinkedInLead = {
  /** LinkedIn profile URL, e.g. https://www.linkedin.com/in/jane-doe. */
  linkedinUrl: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  /** Role or title. */
  position?: string;
  email?: string;
};

/** HeyReach MCP tool that enrolls leads into a campaign. */
const ADD_LEADS_TOOL = "add_leads_to_campaign";

/**
 * Contract: run `fn` against a connected HeyReach MCP client, always closing
 * the transport afterwards. Connection is per call rather than a singleton,
 * which would go stale between invocations. Rejects with a clear error when
 * HEYREACH_MCP_URL is unset.
 */
async function withHeyreachClient<T>(
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const url = process.env.HEYREACH_MCP_URL;

  if (!url) {
    throw new Error(
      "HeyReach LinkedIn sending requires HEYREACH_MCP_URL (the MCP endpoint URL including xMcpKey).",
    );
  }

  const client = new Client({ name: "gtm-campaign", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(url));

  try {
    await client.connect(transport);

    return await fn(client);
  } finally {
    await client.close();
  }
}

/**
 * Contract: enroll `lead` into the configured HeyReach campaign so its sequence
 * sends the LinkedIn connect + message. Resolves on success; rejects with a
 * clear error when env is missing or the MCP tool reports an error.
 */
export async function sendLinkedIn(lead: LinkedInLead): Promise<void> {
  const rawCampaignId = process.env.HEYREACH_CAMPAIGN_ID;

  if (!rawCampaignId) {
    throw new Error(
      "HeyReach LinkedIn sending requires HEYREACH_CAMPAIGN_ID (an active campaign id).",
    );
  }

  // HeyReach's add_leads_to_campaign takes campaignId as an integer.
  const campaignId = Number(rawCampaignId);

  if (!Number.isInteger(campaignId)) {
    throw new Error(
      `HEYREACH_CAMPAIGN_ID must be an integer, got "${rawCampaignId}".`,
    );
  }

  await withHeyreachClient(async (client) => {
    const result = await client.callTool({
      name: ADD_LEADS_TOOL,
      arguments: {
        campaignId,
        // One lead-account pair; linkedInAccountId is omitted so HeyReach
        // picks a sender assigned to the campaign.
        accountLeadPairs: [
          {
            lead: {
              profileUrl: lead.linkedinUrl,
              ...(lead.firstName !== undefined
                ? { firstName: lead.firstName }
                : {}),
              ...(lead.lastName !== undefined
                ? { lastName: lead.lastName }
                : {}),
              ...(lead.company !== undefined
                ? { companyName: lead.company }
                : {}),
              ...(lead.position !== undefined
                ? { position: lead.position }
                : {}),
              ...(lead.email !== undefined
                ? { emailAddress: lead.email }
                : {}),
            },
          },
        ],
      },
    });

    if (result.isError) {
      throw new Error(
        `HeyReach ${ADD_LEADS_TOOL} failed: ${JSON.stringify(result.content)}`,
      );
    }
  });
}
