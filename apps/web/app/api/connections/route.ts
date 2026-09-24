import { NextResponse } from "next/server";
import { recordAudit } from "../../../lib/audit";
import { currentUser } from "../../../lib/auth";
import { connectionSchema, isSafeProviderUrl } from "../../../lib/connections";
import { query } from "../../../lib/db";
import { encryptSecret } from "../../../lib/secrets";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result =
    user.role === "admin"
      ? await query(
          "SELECT id, owner_user_id, name, base_url, visibility, enabled, requests_per_minute, requests_per_day, last_tested_at, last_test_status, created_at, updated_at FROM connections ORDER BY created_at DESC",
        )
      : await query(
          "SELECT id, owner_user_id, name, base_url, visibility, enabled, requests_per_minute, requests_per_day, last_tested_at, last_test_status, created_at, updated_at FROM connections WHERE visibility = 'public' OR owner_user_id = $1 ORDER BY created_at DESC",
          [user.id],
        );
  return NextResponse.json({ connections: result.rows });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = connectionSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid connection" }, { status: 400 });
  if (!isSafeProviderUrl(body.data.baseUrl))
    return NextResponse.json({ error: "provider URL is not allowed" }, { status: 400 });
  const result = await query<{ id: string }>(
    "INSERT INTO connections(owner_user_id, name, base_url, api_key_ciphertext, visibility, requests_per_minute, requests_per_day) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
    [
      user.id,
      body.data.name,
      body.data.baseUrl,
      encryptSecret(body.data.apiKey),
      body.data.visibility,
      body.data.requestsPerMinute,
      body.data.requestsPerDay,
    ],
  );
  await recordAudit(user.id, "connection.created", "connection", result.rows[0].id, {
    visibility: body.data.visibility,
  });
  return NextResponse.json(
    { id: result.rows[0].id, name: body.data.name, visibility: body.data.visibility },
    { status: 201 },
  );
}
