import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "../../../../../lib/auth";
import { withTransaction } from "../../../../../lib/db";
import { providerAccess } from "../../../../../lib/providers";
import { encryptSecret } from "../../../../../lib/secrets";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!(await providerAccess(id, user, true)))
    return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = z
    .object({ name: z.string().trim().min(1).max(100), apiKey: z.string().min(1).max(4096) })
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  const key = await withTransaction(async (client) => {
    const result = await client.query(
      "INSERT INTO provider_keys(provider_id, name, ciphertext) VALUES ($1, $2, $3) RETURNING id, name, enabled",
      [id, body.data.name, encryptSecret(body.data.apiKey)],
    );
    await client.query(
      "INSERT INTO audit_events(actor_user_id, action, resource_type, resource_id) VALUES ($1, 'provider.key_created', 'connection', $2)",
      [user.id, id],
    );
    return result.rows[0];
  });
  return NextResponse.json(key, { status: 201 });
}
