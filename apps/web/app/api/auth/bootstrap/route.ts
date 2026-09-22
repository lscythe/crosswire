import { NextResponse } from "next/server";
import { hashPassword } from "../../../../lib/auth/password";
import { query } from "../../../../lib/db";
import { credentialsSchema } from "../../../../lib/validation";

export async function POST(request: Request) {
  const body = credentialsSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid credentials" }, { status: 400 });
  const configuredEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.toLowerCase();
  const configuredPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (configuredEmail !== body.data.email || configuredPassword !== body.data.password) return NextResponse.json({ error: "bootstrap unavailable" }, { status: 403 });
  const count = await query<{ count: string }>("SELECT count(*) FROM users");
  if (count.rows[0].count !== "0") return NextResponse.json({ error: "bootstrap unavailable" }, { status: 409 });
  const passwordHash = await hashPassword(body.data.password);
  const result = await query<{ id: string }>("INSERT INTO users(email, password_hash, role) VALUES ($1, $2, 'admin') RETURNING id", [body.data.email, passwordHash]);
  return NextResponse.json({ id: result.rows[0].id, email: body.data.email, role: "admin" }, { status: 201 });
}
