import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/auth";
import { query } from "../../../../lib/db";
import { decryptSecret, encryptSecret } from "../../../../lib/secrets";
import { connectionSchema, isSafeProviderUrl } from "../../../../lib/connections";
import { recordAudit } from "../../../../lib/audit";

async function owned(id: string, user: { id: string; role: "admin" | "member" }) {
  const result = await query<{ owner_user_id: string }>("SELECT owner_user_id FROM connections WHERE id = $1", [id]);
  return result.rows[0] && (user.role === "admin" || result.rows[0].owner_user_id === user.id);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!(await owned(id, user))) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (typeof body?.enabled === "boolean") {
    await query("UPDATE connections SET enabled = $1, updated_at = now() WHERE id = $2", [body.enabled, id]);
  } else {
    const parsed = connectionSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "invalid connection" }, { status: 400 });
    if (!isSafeProviderUrl(parsed.data.baseUrl)) return NextResponse.json({ error: "provider URL is not allowed" }, { status: 400 });
    await query("UPDATE connections SET name = $1, base_url = $2, api_key_ciphertext = $3, visibility = $4, updated_at = now() WHERE id = $5", [parsed.data.name, parsed.data.baseUrl, encryptSecret(parsed.data.apiKey), parsed.data.visibility, id]);
  }
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

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const result = await query<{ owner_user_id: string; base_url: string; api_key_ciphertext: string; enabled: boolean }>("SELECT owner_user_id, base_url, api_key_ciphertext, enabled FROM connections WHERE id = $1", [id]);
  const connection = result.rows[0];
  if (!connection || (user.role !== "admin" && connection.owner_user_id !== user.id && !(await query("SELECT 1 FROM connections WHERE id = $1 AND visibility = 'public'", [id])).rowCount)) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const response = await fetch(`${connection.base_url}/models`, { headers: { Authorization: `Bearer ${decryptSecret(connection.api_key_ciphertext)}` }, signal: AbortSignal.timeout(10000) });
    await query("UPDATE connections SET last_tested_at = now(), last_test_status = $1 WHERE id = $2", [response.ok ? "passed" : "failed", id]);
    return NextResponse.json({ ok: response.ok, status: response.status });
  } catch {
    await query("UPDATE connections SET last_tested_at = now(), last_test_status = 'failed' WHERE id = $1", [id]);
    return NextResponse.json({ ok: false, status: 0 }, { status: 502 });
  }
}
