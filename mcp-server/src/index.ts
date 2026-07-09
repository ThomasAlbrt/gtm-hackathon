import "./env.js";

import { pathToFileURL } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { ensureSenderBrand, resolveBrand } from "./brand.js";
import {
  type Contact,
  type ProspectInput,
  listBookings,
  saveContact,
  slugify,
} from "./contacts.js";
import { type LinkedInLead, sendLinkedIn } from "./heyreach.js";
import { type EnrichInput, enrichContact } from "./fullenrich.js";
import { sendIMessage } from "./imessage.js";

const prospectInputSchema = {
  id: z.string().optional(),
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  company: z.string().min(1),
  domain: z.string().optional(),
  role: z.string().optional(),
  signal: z.string().min(1),
  message: z.string().optional(),
  audioUrl: z.string().optional(),
  videoUrl: z.string().optional(),
  calLink: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  smsText: z.string().optional(),
  linkedinUrl: z.string().optional(),
} satisfies z.ZodRawShape;

const launchCampaignInputSchema = {
  prospects: z.array(z.object(prospectInputSchema)).min(1),
  confirm: z.boolean().optional(),
} satisfies z.ZodRawShape;

const sendIMessageInputSchema = {
  recipient: z.string().min(1),
  text: z.string().min(1),
} satisfies z.ZodRawShape;

const sendLinkedInInputSchema = {
  linkedinUrl: z.string().min(1),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  company: z.string().optional(),
  position: z.string().optional(),
  email: z.string().optional(),
} satisfies z.ZodRawShape;

const setSenderBrandInputSchema = {
  domain: z.string().optional(),
} satisfies z.ZodRawShape;

const getBrandInputSchema = {
  domain: z.string().min(1),
} satisfies z.ZodRawShape;

const getBookingsInputSchema = {
  limit: z.number().int().positive().optional(),
} satisfies z.ZodRawShape;

const enrichContactInputSchema = {
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  company: z.string().optional(),
  domain: z.string().optional(),
  linkedinUrl: z.string().optional(),
} satisfies z.ZodRawShape;

type LaunchCampaignInput = {
  prospects: ProspectInput[];
  confirm?: boolean;
};

type SendIMessageInput = {
  recipient: string;
  text: string;
};

type SendLinkedInInput = LinkedInLead;

type SetSenderBrandInput = {
  domain?: string;
};

type GetBrandInput = {
  domain: string;
};

type GetBookingsInput = {
  limit?: number;
};

type EnrichContactInput = EnrichInput;

function baseUrl(): string {
  return (process.env.SITE_BASE_URL ?? "http://localhost:3000").replace(
    /\/+$/,
    "",
  );
}

function textResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

function jsonResult(value: unknown): CallToolResult {
  return textResult(JSON.stringify(value));
}

function errorResult(text: string): CallToolResult {
  return { ...textResult(text), isError: true };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function resolveProspectBrand(
  domain: string | undefined,
): Promise<Contact["brand"] | null> {
  if (!domain) {
    return null;
  }

  try {
    return await resolveBrand(domain);
  } catch {
    return null;
  }
}

async function createLandingPage(
  prospect: ProspectInput,
): Promise<{ id: string; url: string }> {
  const id = prospect.id ?? slugify(prospect.firstName);
  const brand = await resolveProspectBrand(prospect.domain);
  const contact: Contact = {
    id,
    firstName: prospect.firstName,
    company: prospect.company,
    signal: prospect.signal,
    createdAt: new Date().toISOString(),
    ...(prospect.lastName !== undefined ? { lastName: prospect.lastName } : {}),
    ...(prospect.role !== undefined ? { role: prospect.role } : {}),
    ...(prospect.message !== undefined ? { message: prospect.message } : {}),
    ...(prospect.audioUrl !== undefined ? { audioUrl: prospect.audioUrl } : {}),
    ...(prospect.videoUrl !== undefined ? { videoUrl: prospect.videoUrl } : {}),
    ...(prospect.calLink !== undefined ? { calLink: prospect.calLink } : {}),
    ...(prospect.email !== undefined ? { email: prospect.email } : {}),
    ...(brand ? { brand } : {}),
  };

  await saveContact(contact);

  return { id, url: `${baseUrl()}/${id}` };
}

export const handlers = {
  async create_landing_page(prospect: ProspectInput): Promise<CallToolResult> {
    return jsonResult(await createLandingPage(prospect));
  },

  async launch_campaign(input: LaunchCampaignInput): Promise<CallToolResult> {
    if (input.confirm !== true) {
      return errorResult(
        "Refused: launch_campaign requires confirm=true after explicit sales-rep approval.",
      );
    }

    let senderBrand: Awaited<ReturnType<typeof ensureSenderBrand>> = null;
    try {
      senderBrand = await ensureSenderBrand();
    } catch {
      senderBrand = null;
    }

    const report: Array<{
      id: string;
      url: string;
      sms: string;
      linkedin: string;
    }> = [];

    for (const prospect of input.prospects) {
      const landingPage = await createLandingPage(prospect);

      // TODO: Generate the ElevenLabs voice note here when that brick lands.
      // TODO: Generate the HeyGen video here when that brick lands.

      let sms = "skipped (no phone/smsText)";
      if (prospect.phone && prospect.smsText) {
        try {
          await sendIMessage(prospect.phone, prospect.smsText);
          sms = "sent";
        } catch (error) {
          sms = `failed: ${errorMessage(error)}`;
        }
      }

      let linkedin = "skipped (no linkedinUrl)";
      if (prospect.linkedinUrl) {
        try {
          await sendLinkedIn({
            linkedinUrl: prospect.linkedinUrl,
            firstName: prospect.firstName,
            company: prospect.company,
            ...(prospect.lastName !== undefined
              ? { lastName: prospect.lastName }
              : {}),
            ...(prospect.role !== undefined
              ? { position: prospect.role }
              : {}),
            ...(prospect.email !== undefined ? { email: prospect.email } : {}),
          });
          linkedin = "sent";
        } catch (error) {
          linkedin = `failed: ${errorMessage(error)}`;
        }
      }

      report.push({ ...landingPage, sms, linkedin });
    }

    return jsonResult({ report, senderBrand: senderBrand?.domain ?? null });
  },

  async send_imessage(input: SendIMessageInput): Promise<CallToolResult> {
    try {
      await sendIMessage(input.recipient, input.text);
      return textResult(`Sent to ${input.recipient}`);
    } catch (error) {
      return errorResult(errorMessage(error));
    }
  },

  async send_linkedin(input: SendLinkedInInput): Promise<CallToolResult> {
    try {
      await sendLinkedIn(input);
      return textResult(`Enrolled ${input.linkedinUrl} into HeyReach campaign`);
    } catch (error) {
      return errorResult(errorMessage(error));
    }
  },

  async set_sender_brand(
    input: SetSenderBrandInput,
  ): Promise<CallToolResult> {
    let kit: Awaited<ReturnType<typeof ensureSenderBrand>>;
    try {
      kit = await ensureSenderBrand(input.domain);
    } catch {
      kit = null;
    }

    if (!kit) {
      return errorResult(
        "Brand resolution failed: missing key or resolution failed.",
      );
    }

    return jsonResult(kit);
  },

  async get_brand(input: GetBrandInput): Promise<CallToolResult> {
    let kit: Awaited<ReturnType<typeof resolveBrand>>;
    try {
      kit = await resolveBrand(input.domain);
    } catch {
      kit = null;
    }

    if (!kit) {
      return errorResult(
        `Brand resolution failed for ${input.domain}: missing key or resolution failed.`,
      );
    }

    return jsonResult(kit);
  },

  async get_bookings(input: GetBookingsInput): Promise<CallToolResult> {
    const bookings = await listBookings(input.limit);

    return jsonResult({ bookings });
  },

  async enrich_contact(input: EnrichContactInput): Promise<CallToolResult> {
    try {
      return jsonResult(await enrichContact(input));
    } catch (error) {
      return errorResult(errorMessage(error));
    }
  },
};

const createLandingPageDescription =
  "Create a personalized landing page for one prospect. Synthesize `signal` into ONE short English sentence before calling — it renders verbatim as the hero badge on the page (never raw CSV columns or Sillage payloads).";

const launchCampaignDescription =
  "Launch a reviewed outbound campaign by creating landing pages and, where possible, sending iMessages (phone+smsText) and enrolling prospects into LinkedIn outreach via HeyReach (linkedinUrl). Requires the sales rep's EXPLICIT approval: call only after the rep has reviewed the prospect list and messages and said go. Set confirm=true only in that case.";

const sendLinkedInDescription =
  "Enroll one prospect into the configured HeyReach campaign (HEYREACH_CAMPAIGN_ID) by their LinkedIn profile URL, so HeyReach runs its connect + message sequence. The message copy lives in the HeyReach campaign, not here.";

const enrichContactDescription =
  "Find a prospect's professional email and/or phone via FullEnrich, from their name plus company/domain or LinkedIn URL. Returns best-effort email/phone and the raw FullEnrich payload. Requires FULLENRICH_MCP_TOKEN.";

/**
 * The "gtm-campaign" stdio MCP server. Tools:
 * create_landing_page, launch_campaign, send_imessage, send_linkedin,
 * set_sender_brand, get_brand, get_bookings.
 * create_landing_page, launch_campaign, send_imessage, set_sender_brand,
 * get_brand, get_bookings, enrich_contact.
 */
export function createServer(): McpServer {
  const server = new McpServer({ name: "gtm-campaign", version: "0.1.0" });

  server.registerTool(
    "create_landing_page",
    {
      description: createLandingPageDescription,
      inputSchema: prospectInputSchema,
    },
    handlers.create_landing_page,
  );
  server.registerTool(
    "launch_campaign",
    {
      description: launchCampaignDescription,
      inputSchema: launchCampaignInputSchema,
    },
    handlers.launch_campaign,
  );
  server.registerTool(
    "send_imessage",
    {
      description: "Send one iMessage directly to a recipient.",
      inputSchema: sendIMessageInputSchema,
    },
    handlers.send_imessage,
  );
  server.registerTool(
    "send_linkedin",
    {
      description: sendLinkedInDescription,
      inputSchema: sendLinkedInInputSchema,
    },
    handlers.send_linkedin,
  );
  server.registerTool(
    "set_sender_brand",
    {
      description:
        "Resolve and persist the sender brand kit; defaults to SENDER_DOMAIN env (pigment.com).",
      inputSchema: setSenderBrandInputSchema,
    },
    handlers.set_sender_brand,
  );
  server.registerTool(
    "get_brand",
    {
      description: "Resolve a brand kit for a company domain.",
      inputSchema: getBrandInputSchema,
    },
    handlers.get_brand,
  );
  server.registerTool(
    "get_bookings",
    {
      description:
        "Poll this to detect new bookings (proactive ping when a prospect books).",
      inputSchema: getBookingsInputSchema,
    },
    handlers.get_bookings,
  );
  server.registerTool(
    "enrich_contact",
    {
      description: enrichContactDescription,
      inputSchema: enrichContactInputSchema,
    },
    handlers.enrich_contact,
  );

  return server;
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const transport = new StdioServerTransport();
  await createServer().connect(transport);
}
