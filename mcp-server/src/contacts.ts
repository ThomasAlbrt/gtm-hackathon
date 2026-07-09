import { getKv } from "./kv.js";

/**
 * DUPLICATED SCHEMA — the canonical twin lives in web/lib/contacts.ts.
 * Playbook rule: change one, change the other. The two bricks communicate
 * only through these JSON shapes in Upstash.
 */

/** A downloadable font file plus the family it registers. */
export type FontLink = {
  family: string;
  url: string;
  weight?: string;
  style?: string;
};

/** Visual identity and copy extracted for a company domain. */
export type BrandKit = {
  domain: string;
  name?: string;
  logoUrl?: string;
  logoHasWordmark?: boolean;
  iconUrl?: string;
  accent?: string;
  background?: string;
  text?: string;
  cta?: string;
  ctaText?: string;
  palette?: string[];
  fontHeading?: string;
  fontBody?: string;
  fontAccent?: string;
  fontLinks?: FontLink[];
  slogan?: string;
  description?: string;
};

/** Prospect contact record rendered by the web brick. */
export type Contact = {
  id: string;
  firstName: string;
  lastName?: string;
  company: string;
  role?: string;
  /** The "why now" — rendered VERBATIM as the hero badge. */
  signal: string;
  message?: string;
  audioUrl?: string;
  videoUrl?: string;
  calLink?: string;
  email?: string;
  brand?: BrandKit;
  createdAt: string;
};

/** Calendar booking event captured by the web brick's Cal.com webhook. */
export type BookingEvent = {
  contactId?: string;
  attendeeName?: string;
  attendeeEmail?: string;
  title?: string;
  startTime?: string;
  receivedAt: string;
};

/**
 * MCP-side input for one prospect: everything needed to build a Contact,
 * plus the outreach-only fields that never reach the web brick (phone,
 * smsText) and the company domain used for brand resolution.
 */
export type ProspectInput = {
  id?: string;
  firstName: string;
  lastName?: string;
  company: string;
  /** Company domain for brand resolution (e.g. "acme.com"). */
  domain?: string;
  role?: string;
  signal: string;
  message?: string;
  audioUrl?: string;
  videoUrl?: string;
  calLink?: string;
  email?: string;
  /** iMessage recipient; with smsText, triggers the outreach send. */
  phone?: string;
  /** iMessage body; with phone, triggers the outreach send. */
  smsText?: string;
  /** LinkedIn profile URL; when set, enrolls the prospect into HeyReach. */
  linkedinUrl?: string;
};

/** Redis list key containing booking events, newest first. */
export const BOOKINGS_KEY = "bookings";

/** Redis key containing the sender brand kit (no TTL). */
export const SENDER_BRAND_KEY = "sender:brand";

/** Redis key for a contact slug. */
export function contactKey(slug: string): `contact:${string}` {
  return `contact:${slug}`;
}

/** Redis cache key for a resolved brand (TTL 7 days). */
export function brandCacheKey(domain: string): `brand:v2:${string}` {
  return `brand:v2:${domain}`;
}

/**
 * Same slug contract as the web brick: lowercase, NFD-stripped diacritics,
 * random 4-char base36 suffix, format firstname-xxxx, never sequential.
 */
export function slugify(firstName: string): string {
  const base =
    firstName
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "contact";
  const suffix = Array.from({ length: 4 }, () =>
    Math.floor(Math.random() * 36).toString(36),
  ).join("");

  return `${base}-${suffix}`;
}

/** Upsert the contact as JSON at contact:<slug>. */
export async function saveContact(contact: Contact): Promise<void> {
  await getKv().set(contactKey(contact.id), contact);
}

/** Fetch a contact by slug, null when missing. */
export async function getContact(slug: string): Promise<Contact | null> {
  return getKv().get<Contact>(contactKey(slug));
}

/** Read booking events, newest first, optionally limited. */
export async function listBookings(limit?: number): Promise<BookingEvent[]> {
  const stop = limit ? limit - 1 : -1;

  return (await getKv().lrange<BookingEvent>(BOOKINGS_KEY, 0, stop)) ?? [];
}
