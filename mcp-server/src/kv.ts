import { Redis } from "@upstash/redis";

let client: Redis | null = null;

/**
 * Lazy Redis singleton, same contract as web/lib/kv.ts (the two bricks only
 * ever communicate through this database). Accepts both env spellings:
 * UPSTASH_REDIS_REST_URL/TOKEN and KV_REST_API_URL/TOKEN. Never throws at
 * module load.
 */
export function getKv(): Redis {
  if (client) {
    return client;
  }

  const url =
    process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    throw new Error(
      "Missing Upstash env: set UPSTASH_REDIS_REST_URL/TOKEN or KV_REST_API_URL/TOKEN.",
    );
  }

  client = new Redis({ url, token });
  return client;
}
