/* eslint-disable @typescript-eslint/no-unused-vars -- WP0 freezes stub signatures before WP1 implementations. */

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
  /** Public font stylesheet URLs. */
  fontLinks?: string[];
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
export function brandCacheKey(domain: string): `brand:v2:${string}` {
  return `brand:v2:${domain}`;
}

/**
 * Contract: lowercase, NFD-stripped diacritics, plus a random 4-char base36
 * suffix, format firstname-xxxx, never sequential.
 */
export function slugify(_firstName: string): string {
  throw new Error("Not implemented (WP1)");
}

/**
 * Contract: fetch a contact by slug, returning null when not found. This will
 * be wrapped in React cache() in WP1 to dedupe the KV read between
 * generateMetadata and the page.
 */
export async function getContact(_slug: string): Promise<Contact | null> {
  throw new Error("Not implemented (WP1)");
}

/**
 * Contract: upsert the contact as JSON at contact:<slug>.
 */
export async function saveContact(_contact: Contact): Promise<void> {
  throw new Error("Not implemented (WP1)");
}

/**
 * Contract: LPUSH the booking event onto "bookings" so newest events are first.
 */
export async function pushBooking(_event: BookingEvent): Promise<void> {
  throw new Error("Not implemented (WP1)");
}

/**
 * Contract: read booking events from newest to oldest, respecting the optional
 * limit when provided.
 */
export async function listBookings(_limit?: number): Promise<BookingEvent[]> {
  throw new Error("Not implemented (WP1)");
}
