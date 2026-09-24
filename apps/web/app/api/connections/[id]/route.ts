import { NextResponse } from "next/server";
import { recordAudit } from "../../../../lib/audit";
import { currentUser } from "../../../../lib/auth";
import { connectionUpdateSchema, isSafeProviderUrl } from "../../../../lib/connections";
import { query } from "../../../../lib/db";
import { discoverWithKey, providerAccess } from "../../../../lib/providers";
import { encryptSecret } from "../../../../lib/secrets";

async function owned(id: string, user: { id: string; role: "admin" | "member" }) {
  const result = await query<{ owner_user_id: string }>(
    "SELECT owner_user_id FROM connections WHERE id = $1",
    [id],
  );
  return result.rows[0] && (user.role === "admin" || result.rows[0].owner_user_id === user.id);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!(await owned(id, user))) return NextResponse.json({ error: "not found" }, { status: 404 });
  const parsed = connectionUpdateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid connection" }, { status: 400 });
  const body = parsed.data;
  if (body.baseUrl && !isSafeProviderUrl(body.baseUrl))
    return NextResponse.json({ error: "provider URL is not allowed" }, { status: 400 });
  await query(
    "UPDATE connections SET name = COALESCE($1, name), base_url = COALESCE($2, base_url), visibility = COALESCE($3, visibility), enabled = COALESCE($4, enabled), requests_per_minute = COALESCE($5, requests_per_minute), requests_per_day = COALESCE($6, requests_per_day), updated_at = now() WHERE id = $8 AND $7 IS NULL",
    [
      body.name ?? null,
      body.baseUrl ?? null,
      body.visibility ?? null,
      body.enabled ?? null,
      body.requestsPerMinute ?? null,
      body.requestsPerDay ?? null,
      null,
      id,
    ],
  );
  if (body.apiKey)
    await query(
      "UPDATE provider_keys SET ciphertext = $1, last_test_status = NULL WHERE provider_id = $2 AND id = (SELECT selected_key_id FROM connections WHERE id = $2)",
      [encryptSecret(body.apiKey), id],
    );
  await recordAudit(user.id, "connection.updated", "connection", id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!(await owned(id, user))) return NextResponse.json({ error: "not found" }, { status: 404 });
  await query("DELETE FROM connections WHERE id = $1", [id]);
  await recordAudit(user.id, "connection.deleted", "connection", id);
  return new Response(null, { status: 204 });
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const connection = await providerAccess(id, user, true);
  if (!connection || (user.role !== "admin" && connection.owner_user_id !== user.id))
    return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const { models } = await discoverWithKey(connection);
    await query(
      "UPDATE connections SET last_tested_at = now(), last_test_status = 'passed' WHERE id = $1",
      [id],
    );
    return NextResponse.json({ ok: true, status: 200, models: models.map((model) => model.id) });
  } catch {
    await query(
      "UPDATE connections SET last_tested_at = now(), last_test_status = 'failed' WHERE id = $1",
      [id],
    );
    return NextResponse.json({ ok: false, status: 0 }, { status: 502 });
  }
}
