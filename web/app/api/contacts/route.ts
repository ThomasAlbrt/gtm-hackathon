import { z } from "zod";

import type { BrandKit, Contact } from "../../../lib/contacts";
import { saveContact, slugify } from "../../../lib/contacts";
import { requireAdmin } from "../auth";

const contactInputSchema = z.object({
  id: z.string().optional(),
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  company: z.string().min(1),
  role: z.string().optional(),
  signal: z.string().min(1),
  message: z.string().optional(),
  audioUrl: z.string().optional(),
  videoUrl: z.string().optional(),
  calLink: z.string().optional(),
  email: z.string().optional(),
  brand: z.unknown().optional(),
  createdAt: z.string().optional(),
});

export async function POST(req: Request) {
  const unauthorized = requireAdmin(req);

  if (unauthorized) {
    return unauthorized;
  }

  const rawBody = await req.json().catch(() => undefined);
  const result = contactInputSchema.safeParse(rawBody);

  if (!result.success) {
    return Response.json(
      {
        error: "invalid body",
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  const input = result.data;
  const contact: Contact = {
    id: input.id ?? slugify(input.firstName),
    firstName: input.firstName,
    company: input.company,
    signal: input.signal,
    createdAt: input.createdAt ?? new Date().toISOString(),
    ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
    ...(input.role !== undefined ? { role: input.role } : {}),
    ...(input.message !== undefined ? { message: input.message } : {}),
    ...(input.audioUrl !== undefined ? { audioUrl: input.audioUrl } : {}),
    ...(input.videoUrl !== undefined ? { videoUrl: input.videoUrl } : {}),
    ...(input.calLink !== undefined ? { calLink: input.calLink } : {}),
    ...(input.email !== undefined ? { email: input.email } : {}),
    ...(input.brand !== undefined ? { brand: input.brand as BrandKit } : {}),
  };

  await saveContact(contact);

  return Response.json({
    url: `${new URL(req.url).origin}/${contact.id}`,
    contact,
  });
}
