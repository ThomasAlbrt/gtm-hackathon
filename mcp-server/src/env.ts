import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Loaded as the FIRST import of the server. Reads mcp-server/.env resolved
 * relative to the COMPILED file (dist/env.js → ../.env) and never overwrites
 * existing env — shell exports and the .mcp.json `env` block keep priority.
 * Deliberately not --env-file-if-exists: that needs Node ≥ 22.9 and the
 * spawning app's PATH is not under our control.
 */
const here = dirname(fileURLToPath(import.meta.url));

try {
  const raw = readFileSync(resolve(here, "..", ".env"), "utf8");

  for (const line of raw.split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^(["'])(.*)\1$/, "$2");
  }
} catch {
  // Pas de .env — l'env du process fait foi.
}
