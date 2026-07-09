export function requireAdmin(req: Request): Response | null {
  const adminToken = process.env.ADMIN_TOKEN;

  if (!adminToken) {
    return Response.json(
      { error: "ADMIN_TOKEN not configured" },
      { status: 503 },
    );
  }

  if (req.headers.get("authorization") !== `Bearer ${adminToken}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  return null;
}
