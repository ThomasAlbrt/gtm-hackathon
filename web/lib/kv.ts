import type { Redis } from "@upstash/redis";

/**
 * Contract: return a lazy Redis singleton. Accepts both Upstash env spellings:
 * UPSTASH_REDIS_REST_URL/TOKEN and KV_REST_API_URL/TOKEN. Must not throw at
 * module load so builds succeed without env.
 */
export function getKv(): Redis {
  throw new Error("Not implemented (WP1)");
}
