import type { BookingEvent } from "../../../../lib/contacts";
import { pushBooking } from "../../../../lib/contacts";
import { verifyCalSignature } from "../../../../lib/cal-signature";

type CalWebhookBody = {
  triggerEvent?: unknown;
  payload?: {
    metadata?: {
      contactId?: unknown;
    };
    attendees?: Array<{
      name?: unknown;
      email?: unknown;
    }>;
    title?: unknown;
    startTime?: unknown;
  };
};

export async function POST(req: Request) {
  const raw = await req.text();
  const isVerified = verifyCalSignature(
    raw,
    req.headers.get("x-cal-signature-256"),
    process.env.CAL_WEBHOOK_SECRET,
  );

  if (!isVerified) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: CalWebhookBody;

  try {
    body = JSON.parse(raw) as CalWebhookBody;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  if (body.triggerEvent === "BOOKING_CREATED") {
    const attendee = body.payload?.attendees?.[0];
    const event: BookingEvent = {
      contactId: optionalString(body.payload?.metadata?.contactId),
      attendeeName: optionalString(attendee?.name),
      attendeeEmail: optionalString(attendee?.email),
      title: optionalString(body.payload?.title),
      startTime: optionalString(body.payload?.startTime),
      receivedAt: new Date().toISOString(),
    };

    await pushBooking(event);
  }

  return Response.json({ received: true });
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
