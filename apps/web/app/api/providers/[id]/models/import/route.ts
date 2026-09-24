import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "../../../../../../lib/auth";
import { withTransaction } from "../../../../../../lib/db";
import { discoverWithKey, providerAccess, uuid } from "../../../../../../lib/providers";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const provider = await providerAccess(id, user, true);
  if (!provider) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = z
    .object({
      keyId: uuid,
      modelIds: z.array(z.string().min(1).max(200)).min(1).max(5000).optional(),
    })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!body.success)
    return NextResponse.json({ error: "Select a key and valid models" }, { status: 400 });
  try {
    const { keyId, models } = await discoverWithKey(provider, body.data.keyId);
    if (!body.data.modelIds) return NextResponse.json({ models });
    const selected = new Set(body.data.modelIds);
    if ([...selected].some((id) => !models.some((model) => model.id === id)))
      return NextResponse.json(
        { error: "Provider model list changed. Refresh the preview." },
        { status: 409 },
      );
    await withTransaction(async (client) => {
      for (const { id: upstreamId, ...metadata } of models.filter((model) =>
        selected.has(model.id),
      )) {
        await client.query(
          "INSERT INTO provider_models(provider_id, upstream_id, display_name, imported_metadata, discovered_by_key_id, imported_at) VALUES ($1, $2, $2, $3, $4, now()) ON CONFLICT (provider_id, upstream_id) DO UPDATE SET imported_metadata = EXCLUDED.imported_metadata, discovered_by_key_id = EXCLUDED.discovered_by_key_id, imported_at = now(), updated_at = now()",
          [id, upstreamId, JSON.stringify(metadata), keyId],
        );
      }
      await client.query(
        "INSERT INTO audit_events(actor_user_id, action, resource_type, resource_id, metadata) VALUES ($1, 'provider.models_imported', 'connection', $2, $3)",
        [user.id, id, JSON.stringify({ count: selected.size, keyId })],
      );
    });
    return NextResponse.json({ imported: selected.size });
  } catch {
    return NextResponse.json(
      { error: "Model discovery failed. Check the selected key and provider URL." },
      { status: 502 },
    );
  }
}
