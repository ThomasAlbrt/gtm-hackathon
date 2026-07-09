import "./env.js";

import { pathToFileURL } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

/**
 * The "gtm-campaign" stdio MCP server. Tools (registered in B3-WPC):
 * create_landing_page, launch_campaign, send_imessage, set_sender_brand,
 * get_brand, get_bookings.
 */
export function createServer(): McpServer {
  const server = new McpServer({ name: "gtm-campaign", version: "0.1.0" });

  // Tools enregistrés en B3-WPC.

  return server;
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const transport = new StdioServerTransport();
  await createServer().connect(transport);
}
