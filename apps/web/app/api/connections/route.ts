import { NextResponse } from "next/server";
import { recordAudit } from "../../../lib/audit";
import { currentUser } from "../../../lib/auth";
import { connectionSchema, isSafeProviderUrl } from "../../../lib/connections";
import { query, withTransaction } from "../../../lib/db";
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
  const result = await withTransaction(async (client) => {
    const provider = await client.query<{ id: string }>(
      "INSERT INTO connections(owner_user_id, name, base_url, visibility, requests_per_minute, requests_per_day) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
      [
        user.id,
        body.data.name,
        body.data.baseUrl,
        body.data.visibility,
        body.data.requestsPerMinute,
        body.data.requestsPerDay,
      ],
    );
    const key = await client.query<{ id: string }>(
      "INSERT INTO provider_keys(provider_id, name, ciphertext) VALUES ($1, 'Default', $2) RETURNING id",
      [provider.rows[0].id, encryptSecret(body.data.apiKey)],
    );
    await client.query("UPDATE connections SET selected_key_id = $1 WHERE id = $2", [
      key.rows[0].id,
      provider.rows[0].id,
    ]);
    return provider;
  });
  await recordAudit(user.id, "connection.created", "connection", result.rows[0].id, {
    visibility: body.data.visibility,
  });
  return NextResponse.json(
    { id: result.rows[0].id, name: body.data.name, visibility: body.data.visibility },
    { status: 201 },
  );
}
