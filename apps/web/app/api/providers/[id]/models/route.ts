import { NextResponse } from "next/server";
import { currentUser } from "../../../../../lib/auth";
import { query, withTransaction } from "../../../../../lib/db";
import { modelSchema } from "../../../../../lib/provider-models";
import { providerAccess } from "../../../../../lib/providers";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!(await providerAccess(id, user)))
    return NextResponse.json({ error: "not found" }, { status: 404 });
  const result = await query(
    "SELECT id, upstream_id, display_name, enabled, imported_metadata, overrides, discovered_by_key_id, imported_at FROM provider_models WHERE provider_id = $1 ORDER BY upstream_id",
    [id],
  );
  return NextResponse.json({ models: result.rows });
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!(await providerAccess(id, user, true)))
    return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = modelSchema.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return NextResponse.json({ error: "Invalid model configuration" }, { status: 400 });
  const model = await withTransaction(async (client) => {
    const result = await client.query(
      "INSERT INTO provider_models(provider_id, upstream_id, display_name, enabled, overrides) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (provider_id, upstream_id) DO NOTHING RETURNING id",
      [
        id,
        body.data.upstreamId,
        body.data.displayName,
        body.data.enabled,
        JSON.stringify(body.data.overrides),
      ],
    );
    if (result.rowCount)
      await client.query(
        "INSERT INTO audit_events(actor_user_id, action, resource_type, resource_id) VALUES ($1, 'provider.model_created', 'connection', $2)",
        [user.id, id],
      );
    return result.rows[0];
  });
  return model
    ? NextResponse.json(model, { status: 201 })
    : NextResponse.json({ error: "Model already exists" }, { status: 409 });
}
