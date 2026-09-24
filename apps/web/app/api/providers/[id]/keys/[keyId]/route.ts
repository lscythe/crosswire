import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "../../../../../../lib/auth";
import { query, withTransaction } from "../../../../../../lib/db";
import { discoverWithKey, providerAccess, uuid } from "../../../../../../lib/providers";
import { encryptSecret } from "../../../../../../lib/secrets";

type Context = { params: Promise<{ id: string; keyId: string }> };
export async function PATCH(request: Request, context: Context) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, keyId } = await context.params;
  if (!uuid.safeParse(keyId).success || !(await providerAccess(id, user, true)))
    return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = z
    .object({
      name: z.string().trim().min(1).max(100).optional(),
      apiKey: z.string().min(1).max(4096).optional(),
      enabled: z.boolean().optional(),
    })
    .strict()
    .refine((v) => Object.keys(v).length > 0)
    .safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid key update" }, { status: 400 });
  const result = await withTransaction(async (client) => {
    await client.query("SELECT id FROM connections WHERE id = $1 FOR UPDATE", [id]);
    const updated = await client.query(
      "UPDATE provider_keys SET name = COALESCE($1, name), ciphertext = COALESCE($2, ciphertext), enabled = COALESCE($3, enabled), last_test_status = CASE WHEN $2::text IS NULL THEN last_test_status ELSE NULL END WHERE provider_id = $4 AND id = $5 RETURNING id",
      [
        body.data.name ?? null,
        body.data.apiKey ? encryptSecret(body.data.apiKey) : null,
        body.data.enabled ?? null,
        id,
        keyId,
      ],
    );
    if (updated.rowCount)
      await client.query(
        "INSERT INTO audit_events(actor_user_id, action, resource_type, resource_id) VALUES ($1, 'provider.key_updated', 'connection', $2)",
        [user.id, id],
      );
    return updated.rowCount;
  });
  return result
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "not found" }, { status: 404 });
}
export async function POST(_request: Request, context: Context) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, keyId } = await context.params;
  const provider = await providerAccess(id, user, true);
  if (!provider || !uuid.safeParse(keyId).success)
    return NextResponse.json({ error: "not found" }, { status: 404 });
  let ok = false;
  try {
    await discoverWithKey(provider, keyId);
    ok = true;
  } catch {}
  await query(
    "UPDATE provider_keys SET last_tested_at = now(), last_test_status = $1 WHERE provider_id = $2 AND id = $3",
    [ok ? "passed" : "failed", id, keyId],
  );
  return NextResponse.json(
    {
      ok,
      message: ok ? "Key test passed" : "Key test failed. Check provider access and credentials.",
    },
    { status: ok ? 200 : 502 },
  );
}
