import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "../../../../lib/auth";
import { routingSchema } from "../../../../lib/routing";
import { saveRouting } from "../../../../lib/routing-store";
import { withTransaction } from "../../../../lib/db";

type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, context: Context) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = routingSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid config: provide routes with unique priorities per alias" }, { status: 400 });
  try {
    const saved = await saveRouting(user.id, body.data, id);
    return saved ? NextResponse.json({ id: saved }) : NextResponse.json({ error: "not found" }, { status: 404 });
  } catch (error) {
    if (error instanceof Error && error.message === "Route connections must be enabled and accessible") return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}

async function changeDefaultOrDelete(id: string, userId: string, remove: boolean) {
  return withTransaction(async (client) => {
    await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
    if (!(await client.query("SELECT id FROM routing_configs WHERE id = $1 AND owner_user_id = $2", [id, userId])).rowCount) return false;
    if (remove) await client.query("DELETE FROM routing_configs WHERE id = $1", [id]);
    else {
      await client.query("UPDATE routing_configs SET is_default = false WHERE owner_user_id = $1", [userId]);
      await client.query("UPDATE routing_configs SET is_default = true, updated_at = now() WHERE id = $1", [id]);
    }
    await client.query("INSERT INTO audit_events(actor_user_id, action, resource_type, resource_id) VALUES ($1, $2, 'routing_config', $3)", [userId, remove ? "routing_config.deleted" : "routing_config.default_changed", id]);
    return true;
  });
}

export async function PATCH(request: Request, context: Context) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!z.object({ isDefault: z.literal(true) }).strict().safeParse(await request.json().catch(() => null)).success) return NextResponse.json({ error: "Only isDefault: true is supported" }, { status: 400 });
  return await changeDefaultOrDelete(id, user.id, false) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not found" }, { status: 404 });
}

export async function DELETE(_request: Request, context: Context) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "not found" }, { status: 404 });
  return await changeDefaultOrDelete(id, user.id, true) ? new Response(null, { status: 204 }) : NextResponse.json({ error: "not found" }, { status: 404 });
}
