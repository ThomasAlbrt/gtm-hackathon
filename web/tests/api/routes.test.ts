import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as getBookings } from "../../app/api/bookings/route";
import { POST as postContact } from "../../app/api/contacts/route";
import { POST as postCalWebhook } from "../../app/api/webhooks/cal/route";

const contactStore = vi.hoisted(() => ({
  listBookings: vi.fn(),
  pushBooking: vi.fn(),
  saveContact: vi.fn(),
  slugify: vi.fn(),
}));

vi.mock("../../lib/contacts", () => ({
  listBookings: contactStore.listBookings,
  pushBooking: contactStore.pushBooking,
  saveContact: contactStore.saveContact,
  slugify: contactStore.slugify,
}));

function adminHeaders(token = "secret-token"): HeadersInit {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

function signedHeaders(rawBody: string, secret: string): HeadersInit {
  return {
    "content-type": "application/json",
    "x-cal-signature-256": createHmac("sha256", secret)
      .update(rawBody, "utf8")
      .digest("hex"),
  };
}

describe("api routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    contactStore.slugify.mockReturnValue("test-ab12");
    contactStore.saveContact.mockResolvedValue(undefined);
    contactStore.pushBooking.mockResolvedValue(undefined);
    contactStore.listBookings.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects contact creation without Authorization", async () => {
    vi.stubEnv("ADMIN_TOKEN", "secret-token");

    const response = await postContact(
      new Request("http://localhost/api/contacts", {
        method: "POST",
        body: JSON.stringify(validContactBody()),
      }),
    );

    expect(response.status).toBe(401);
    expect(contactStore.saveContact).not.toHaveBeenCalled();
  });

  it("rejects contact creation with the wrong token", async () => {
    vi.stubEnv("ADMIN_TOKEN", "secret-token");

    const response = await postContact(
      new Request("http://localhost/api/contacts", {
        method: "POST",
        headers: adminHeaders("wrong-token"),
        body: JSON.stringify(validContactBody()),
      }),
    );

    expect(response.status).toBe(401);
    expect(contactStore.saveContact).not.toHaveBeenCalled();
  });

  it("returns 503 when ADMIN_TOKEN is unset", async () => {
    vi.stubEnv("ADMIN_TOKEN", undefined);

    const response = await postContact(
      new Request("http://localhost/api/contacts", {
        method: "POST",
        body: JSON.stringify(validContactBody()),
      }),
    );

    expect(response.status).toBe(503);
  });

  it("creates a contact with a generated id", async () => {
    vi.stubEnv("ADMIN_TOKEN", "secret-token");

    const response = await postContact(
      new Request("http://localhost/api/contacts", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify(validContactBody()),
      }),
    );
    const json = (await response.json()) as {
      url: string;
      contact: { id: string };
    };

    expect(response.status).toBe(200);
    expect(contactStore.slugify).toHaveBeenCalledWith("Test");
    expect(contactStore.saveContact).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "test-ab12",
        firstName: "Test",
        company: "Acme",
        signal: "Hiring push",
      }),
    );
    expect(json.url.endsWith("/test-ab12")).toBe(true);
    expect(json.contact.id).toBe("test-ab12");
  });

  it("rejects invalid contact bodies", async () => {
    vi.stubEnv("ADMIN_TOKEN", "secret-token");

    const response = await postContact(
      new Request("http://localhost/api/contacts", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ firstName: "", company: "Acme" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(contactStore.saveContact).not.toHaveBeenCalled();
  });

  it("returns bookings for authorized admins", async () => {
    vi.stubEnv("ADMIN_TOKEN", "secret-token");
    const bookings = [
      {
        contactId: "test-ab12",
        attendeeEmail: "test@example.com",
        receivedAt: "2026-07-09T00:00:00.000Z",
      },
    ];
    contactStore.listBookings.mockResolvedValue(bookings);

    const response = await getBookings(
      new Request("http://localhost/api/bookings", {
        headers: adminHeaders(),
      }),
    );
    const json = (await response.json()) as { bookings: typeof bookings };

    expect(response.status).toBe(200);
    expect(contactStore.listBookings).toHaveBeenCalledWith();
    expect(json.bookings).toEqual(bookings);
  });

  it("accepts signed BOOKING_CREATED Cal.com webhooks", async () => {
    vi.stubEnv("CAL_WEBHOOK_SECRET", "cal-secret");
    const rawBody = JSON.stringify(calBookingCreatedBody());

    const response = await postCalWebhook(
      new Request("http://localhost/api/webhooks/cal", {
        method: "POST",
        headers: signedHeaders(rawBody, "cal-secret"),
        body: rawBody,
      }),
    );

    expect(response.status).toBe(200);
    expect(contactStore.pushBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: "test-ab12",
        attendeeName: "Test Person",
        attendeeEmail: "test@example.com",
        title: "Intro call",
        startTime: "2026-07-10T10:00:00.000Z",
      }),
    );
  });

  it("rejects Cal.com webhooks with a bad signature", async () => {
    vi.stubEnv("CAL_WEBHOOK_SECRET", "cal-secret");
    const rawBody = JSON.stringify(calBookingCreatedBody());

    const response = await postCalWebhook(
      new Request("http://localhost/api/webhooks/cal", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-cal-signature-256": "bad-signature",
        },
        body: rawBody,
      }),
    );

    expect(response.status).toBe(401);
    expect(contactStore.pushBooking).not.toHaveBeenCalled();
  });

  it("accepts Cal.com webhooks when no secret is configured", async () => {
    vi.stubEnv("CAL_WEBHOOK_SECRET", undefined);
    const rawBody = JSON.stringify(calBookingCreatedBody());

    const response = await postCalWebhook(
      new Request("http://localhost/api/webhooks/cal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: rawBody,
      }),
    );

    expect(response.status).toBe(200);
  });
});

function validContactBody() {
  return {
    firstName: "Test",
    company: "Acme",
    signal: "Hiring push",
    message: "Let's talk.",
  };
}

function calBookingCreatedBody() {
  return {
    triggerEvent: "BOOKING_CREATED",
    payload: {
      metadata: {
        contactId: "test-ab12",
      },
      attendees: [
        {
          name: "Test Person",
          email: "test@example.com",
        },
      ],
      title: "Intro call",
      startTime: "2026-07-10T10:00:00.000Z",
    },
  };
}
