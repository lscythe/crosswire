import { NextResponse } from "next/server";
import { hashPassword } from "../../../../lib/auth/password";
import { query } from "../../../../lib/db";
import { credentialsSchema, createUserSchema } from "../../../../lib/validation";

export async function POST(request: Request) {
  const body = credentialsSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid credentials" }, { status: 400 });
  const configuredEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.toLowerCase();
  const configuredUsername = (process.env.BOOTSTRAP_ADMIN_USERNAME ?? "admin").trim().toLowerCase();
  const configuredPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (configuredUsername !== body.data.username || configuredPassword !== body.data.password) return NextResponse.json({ error: "bootstrap unavailable" }, { status: 403 });
  if (!createUserSchema.safeParse({ username: body.data.username, email: configuredEmail }).success) return NextResponse.json({ error: "bootstrap unavailable" }, { status: 403 });
  const passwordHash = await hashPassword(body.data.password);
  const result = await query<{ id: string }>("INSERT INTO users(username, email, password_hash, role) SELECT $1, $2, $3, 'admin' WHERE NOT EXISTS (SELECT 1 FROM users) RETURNING id", [body.data.username, configuredEmail, passwordHash]);
  if (!result.rows[0]) return NextResponse.json({ error: "bootstrap unavailable" }, { status: 409 });
  return NextResponse.json({ id: result.rows[0].id, username: body.data.username, email: configuredEmail, role: "admin" }, { status: 201 });
}
