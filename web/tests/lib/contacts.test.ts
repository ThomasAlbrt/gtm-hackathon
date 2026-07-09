import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BookingEvent, Contact } from "../../lib/contacts";
import {
  BOOKINGS_KEY,
  listBookings,
  pushBooking,
  saveContact,
  slugify,
} from "../../lib/contacts";

const { fakeKv } = vi.hoisted(() => ({
  fakeKv: {
    get: vi.fn(),
    lpush: vi.fn(),
    lrange: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock("../../lib/kv", () => ({
  getKv: vi.fn(() => fakeKv),
}));

describe("contacts lib", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeKv.lrange.mockResolvedValue([]);
  });

  it("writes contacts to contact:<id>", async () => {
    const contact: Contact = {
      id: "eloise-ab12",
      firstName: "Eloise",
      company: "Acme",
      signal: "New funding",
      createdAt: "2026-07-09T00:00:00.000Z",
    };

    await saveContact(contact);

    expect(fakeKv.set).toHaveBeenCalledWith("contact:eloise-ab12", contact);
  });

  it("pushes booking events onto the bookings list", async () => {
    const event: BookingEvent = {
      contactId: "eloise-ab12",
      attendeeEmail: "eloise@example.com",
      receivedAt: "2026-07-09T00:00:00.000Z",
    };

    await pushBooking(event);

    expect(fakeKv.lpush).toHaveBeenCalledWith(BOOKINGS_KEY, event);
  });

  it("maps a booking limit to the inclusive lrange stop", async () => {
    await listBookings(5);

    expect(fakeKv.lrange).toHaveBeenCalledWith(BOOKINGS_KEY, 0, 4);
  });

  it("reads all booking events when no limit is provided", async () => {
    await listBookings();

    expect(fakeKv.lrange).toHaveBeenCalledWith(BOOKINGS_KEY, 0, -1);
  });

  it("strips diacritics and appends a random suffix", () => {
    expect(slugify("Éloïse")).toMatch(/^eloise-[a-z0-9]{4}$/);
  });

  it("lowercases uppercase input", () => {
    expect(slugify("ALICE")).toMatch(/^alice-[a-z0-9]{4}$/);
  });

  it("uses a different random suffix for consecutive calls", () => {
    expect(slugify("Sam")).not.toBe(slugify("Sam"));
  });

  it("falls back to contact for empty or symbol-only input", () => {
    expect(slugify("!?*")).toMatch(/^contact-[a-z0-9]{4}$/);
  });
});
