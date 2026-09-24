import { NextResponse } from "next/server";
import { currentUser } from "../../../../../../lib/auth";
import { withTransaction } from "../../../../../../lib/db";
import { modelSchema } from "../../../../../../lib/provider-models";
import { providerAccess, uuid } from "../../../../../../lib/providers";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; modelId: string }> },
) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, modelId } = await context.params;
  if (!uuid.safeParse(modelId).success || !(await providerAccess(id, user, true)))
    return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = modelSchema
    .omit({ upstreamId: true })
    .partial()
    .strict()
    .refine((v) => Object.keys(v).length > 0)
    .safeParse(await request.json().catch(() => null));
  if (!body.success)
    return NextResponse.json({ error: "Invalid model configuration" }, { status: 400 });
  const count = await withTransaction(async (client) => {
    const result = await client.query(
      "UPDATE provider_models SET display_name = COALESCE($1, display_name), enabled = COALESCE($2, enabled), overrides = COALESCE($3, overrides), updated_at = now() WHERE provider_id = $4 AND id = $5 RETURNING id",
      [
        body.data.displayName ?? null,
        body.data.enabled ?? null,
        body.data.overrides ? JSON.stringify(body.data.overrides) : null,
        id,
        modelId,
      ],
    );
    if (result.rowCount)
      await client.query(
        "INSERT INTO audit_events(actor_user_id, action, resource_type, resource_id) VALUES ($1, 'provider.model_updated', 'connection', $2)",
        [user.id, id],
      );
    return result.rowCount;
  });
  return count
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "not found" }, { status: 404 });
}
