import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { hashPassword } from "../../../../lib/auth/password";
import { query, withTransaction } from "../../../../lib/db";
import { credentialsSchema } from "../../../../lib/validation";

export async function POST(request: Request) {
  const body = credentialsSchema.safeParse(await request.json().catch(() => null));
  const token = new URL(request.url).searchParams.get("token");
  if (!body.success || !token) return NextResponse.json({ error: "invalid invitation" }, { status: 400 });
  const tokenHash = createHash("sha256").update(token).digest();
  const invitation = await query<{ id: string; email: string; role: "admin" | "member" }>("SELECT id, email, role FROM invitations WHERE token_hash = $1 AND accepted_at IS NULL AND expires_at > now()", [tokenHash]);
  const row = invitation.rows[0];
  if (!row || row.email !== body.data.email) return NextResponse.json({ error: "invalid invitation" }, { status: 400 });
  const passwordHash = await hashPassword(body.data.password);
  await withTransaction(async (client) => {
    await client.query("INSERT INTO users(email, password_hash, role) VALUES ($1, $2, $3)", [row.email, passwordHash, row.role]);
    await client.query("UPDATE invitations SET accepted_at = now() WHERE id = $1", [row.id]);
  });
  return NextResponse.json({ email: row.email, role: row.role }, { status: 201 });
}
