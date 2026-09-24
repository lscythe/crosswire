import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { hashOpaqueToken, sessionCookie } from "../../../../lib/auth";
import { verifyPassword } from "../../../../lib/auth/password";
import { withTransaction } from "../../../../lib/db";
import { credentialsSchema } from "../../../../lib/validation";

export async function POST(request: Request) {
  const body = credentialsSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid credentials" }, { status: 400 });
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
  const user = await withTransaction(async (client) => {
    // Serialize login with password changes so old credentials cannot create a surviving session.
    const result = await client.query(
      "SELECT id, username, email, name, role, password_hash, disabled_at, must_change_password FROM users WHERE username = $1 FOR UPDATE",
      [body.data.username],
    );
    const row = result.rows[0];
    if (!row || !(await verifyPassword(row.password_hash, body.data.password)) || row.disabled_at)
      return null;
    await client.query(
      "INSERT INTO sessions(user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
      [row.id, hashOpaqueToken(token), expiresAt],
    );
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      name: row.name,
      role: row.role,
      mustChangePassword: row.must_change_password,
    };
  });
  if (!user) return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  const response = NextResponse.json(user);
  response.cookies.set(sessionCookie(token, expiresAt));
  return response;
}
