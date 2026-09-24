import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "../../../../lib/auth";
import { withTransaction } from "../../../../lib/db";
import { providerAccess, uuid } from "../../../../lib/providers";
import { PATCH as edit } from "../../connections/[id]/route";

export { DELETE, POST } from "../../connections/[id]/route";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const raw = await request
    .clone()
    .json()
    .catch(() => null);
  if (!raw || !("keyMode" in raw || "selectedKeyId" in raw)) return edit(request, context);
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!(await providerAccess(id, user, true)))
    return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = z
    .object({ keyMode: z.enum(["selected", "round_robin"]), selectedKeyId: uuid })
    .strict()
    .safeParse(raw);
  if (!body.success)
    return NextResponse.json({ error: "Select a key and rotation mode" }, { status: 400 });
  const updated = await withTransaction(async (client) => {
    await client.query("SELECT id FROM connections WHERE id = $1 FOR UPDATE", [id]);
    const key = await client.query(
      "SELECT id FROM provider_keys WHERE provider_id = $1 AND id = $2 AND enabled",
      [id, body.data.selectedKeyId],
    );
    if (!key.rowCount) return false;
    await client.query(
      "UPDATE connections SET key_mode = $1, selected_key_id = $2, updated_at = now() WHERE id = $3",
      [body.data.keyMode, body.data.selectedKeyId, id],
    );
    await client.query(
      "INSERT INTO audit_events(actor_user_id, action, resource_type, resource_id) VALUES ($1, 'provider.key_selection_updated', 'connection', $2)",
      [user.id, id],
    );
    return true;
  });
  return NextResponse.json(
    updated ? { ok: true } : { error: "Select an enabled key belonging to this provider" },
    { status: updated ? 200 : 400 },
  );
}
