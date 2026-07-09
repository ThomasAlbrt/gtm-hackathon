import { listBookings } from "../../../lib/contacts";
import { requireAdmin } from "../auth";

export async function GET(req: Request) {
  const unauthorized = requireAdmin(req);

  if (unauthorized) {
    return unauthorized;
  }

  const bookings = await listBookings();

  return Response.json({ bookings });
}
