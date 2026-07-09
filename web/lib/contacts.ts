import { cache } from "react";

import { getKv } from "./kv";

/**
 * A downloadable font file plus the family it registers. Consumed by the
 * brand theming layer to emit @font-face rules; produced by brand resolution.
 */
export type FontLink = {
  /** Font family name the file registers. */
  family: string;
  /** HTTPS URL of the font file (woff2/woff/ttf/otf). */
  url: string;
  /** Numeric CSS weight, e.g. "400". */
  weight?: string;
  /** CSS font style, e.g. "italic". */
  style?: string;
};

/**
 * Visual identity and copy extracted for a company domain.
 */
export type BrandKit = {
  /** Company domain used as the canonical brand lookup key. */
  domain: string;
  /** Human-readable brand or company name. */
  name?: string;
  /** Public URL for the brand logo asset. */
  logoUrl?: string;
  /** Whether the logo asset includes a wordmark. */
  logoHasWordmark?: boolean;
  /** Public URL for the brand icon asset. */
  iconUrl?: string;
  /** Primary accent color for generated pages. */
  accent?: string;
  /** Page background color. */
  background?: string;
  /** Primary text color. */
  text?: string;
  /** CTA background or accent color. */
  cta?: string;
  /** CTA text color. */
  ctaText?: string;
  /** Brand color palette. */
  palette?: string[];
  /** Heading font family name. */
  fontHeading?: string;
  /** Body font family name. */
  fontBody?: string;
  /** Accent font family name. */
  fontAccent?: string;
  /** Font files to register via @font-face. */
  fontLinks?: FontLink[];
  /** Brand slogan or tagline. */
  slogan?: string;
  /** Short brand description. */
  description?: string;
};

/**
 * Prospect contact record used to render a personalized page.
 */
export type Contact = {
  /** Stable slug identifier for the contact. */
  id: string;
  /** Contact first name. */
  firstName: string;
  /** Contact last name. */
  lastName?: string;
  /** Company name shown on the personalized page. */
  company: string;
  /** Contact role or title. */
  role?: string;
  /** The "why now" signal, rendered verbatim as a hero badge. */
  signal: string;
  /** Personalized outbound message. */
  message?: string;
  /** Public URL for generated audio. */
  audioUrl?: string;
  /** Public URL for generated video. */
  videoUrl?: string;
  /** Calendar booking URL. */
  calLink?: string;
  /** Contact email address. */
  email?: string;
  /** Company visual identity and copy. */
  brand?: BrandKit;
  /** Hackathon jury member (judge/mentor). */
  jury?: boolean;
  /** ISO timestamp for contact creation. */
  createdAt: string;
};

/**
 * Calendar booking event captured from polling or webhooks.
 */
export type BookingEvent = {
  /** Slug identifier for the associated contact, when known. */
  contactId?: string;
  /** Booking attendee display name. */
  attendeeName?: string;
  /** Booking attendee email address. */
  attendeeEmail?: string;
  /** Calendar event title. */
  title?: string;
  /** ISO start timestamp for the booked event. */
  startTime?: string;
  /** ISO timestamp for when this event was received. */
  receivedAt: string;
};

/** Redis list key containing booking events, newest first. */
export const BOOKINGS_KEY = "bookings";

/** Redis key containing the sender brand kit. */
export const SENDER_BRAND_KEY = "sender:brand";

/**
 * Return the Redis key for a contact slug.
 */
export function contactKey(slug: string): `contact:${string}` {
  return `contact:${slug}`;
}

/**
 * Return the Redis cache key for a brand domain.
 */
export function brandCacheKey(domain: string): `brand:v3:${string}` {
  return `brand:v3:${domain}`;
}

/**
 * Contract: lowercase, NFD-stripped diacritics, plus a random 4-char base36
 * suffix, format firstname-xxxx, never sequential.
 */
export function slugify(firstName: string): string {
  const base =
    firstName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") || "contact";

  return `${base}-${randomBase36Suffix()}`;
}

/**
 * Contract: fetch a contact by slug, returning null when not found. This will
 * be wrapped in React cache() in WP1 to dedupe the KV read between
 * generateMetadata and the page.
 */
const getContactCached = cache(
  async (slug: string): Promise<Contact | null> =>
    getKv().get<Contact>(contactKey(slug)),
);

export async function getContact(slug: string): Promise<Contact | null> {
  return getContactCached(slug);
}

/**
 * Contract: upsert the contact as JSON at contact:<slug>.
 */
export async function saveContact(contact: Contact): Promise<void> {
  await getKv().set(contactKey(contact.id), contact);
}

/**
 * Contract: read the sender company's brand kit from sender:brand, or null
 * when it has not been resolved yet.
 */
export async function getSenderBrand(): Promise<BrandKit | null> {
  return getKv().get<BrandKit>(SENDER_BRAND_KEY);
}

/**
 * Contract: LPUSH the booking event onto "bookings" so newest events are first.
 */
export async function pushBooking(event: BookingEvent): Promise<void> {
  await getKv().lpush(BOOKINGS_KEY, event);
}

/**
 * Contract: read booking events from newest to oldest, respecting the optional
 * limit when provided.
 */
export async function listBookings(limit?: number): Promise<BookingEvent[]> {
  const stop = limit ? limit - 1 : -1;

  return (await getKv().lrange<BookingEvent>(BOOKINGS_KEY, 0, stop)) ?? [];
}

let previousSuffix: string | null = null;

function randomBase36Suffix(): string {
  let suffix = "";

  do {
    suffix = Array.from({ length: 4 }, () =>
      Math.floor(Math.random() * 36).toString(36),
    ).join("");
  } while (suffix === previousSuffix);

  previousSuffix = suffix;
  return suffix;
}
