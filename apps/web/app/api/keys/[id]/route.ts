import { NextResponse } from "next/server";
import { currentUser } from "../../../../lib/auth";
import { query } from "../../../../lib/db";
import { recordAudit } from "../../../../lib/audit";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "invalid key ID" }, { status: 400 });
  const result = await query<{ id: string }>("UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING id", [id, user.id]);
  if (!result.rows[0]) return NextResponse.json({ error: "not found" }, { status: 404 });
  await recordAudit(user.id, "api_key.revoked", "api_key", id);
  return new Response(null, { status: 204 });
}
