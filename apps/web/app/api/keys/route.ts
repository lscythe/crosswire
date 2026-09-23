import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";
import { createApiKey } from "../../../lib/auth/apikey";
import { query } from "../../../lib/db";
import { recordAudit } from "../../../lib/audit";
import { apiKeySchema } from "../../../lib/validation";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await query("SELECT id, name, key_prefix, last_used_at, revoked_at, created_at FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC", [user.id]);
  return NextResponse.json({ keys: result.rows }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = apiKeySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid API key name" }, { status: 400 });
  const { plaintext, record } = createApiKey(user.id, body.data.name);
  await query("INSERT INTO api_keys(id, user_id, name, key_hash, key_prefix) VALUES ($1, $2, $3, $4, $5)", [record.id, record.userId, record.name, record.keyHash, record.keyPrefix]);
  await recordAudit(user.id, "api_key.created", "api_key", record.id);
  return NextResponse.json({ id: record.id, name: record.name, key: plaintext }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
