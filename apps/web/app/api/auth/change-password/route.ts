import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser, hashOpaqueToken, SESSION_COOKIE } from "../../../../lib/auth";
import { hashPassword, verifyPassword } from "../../../../lib/auth/password";
import { withTransaction } from "../../../../lib/db";

const schema = z.object({ password: z.string().min(12).max(1024), confirmPassword: z.string() }).refine((body) => body.password === body.confirmPassword);

export async function POST(request: Request) {
  const user = await currentUser(true);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Passwords must match and contain 12–1024 characters" }, { status: 400 });
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const hash = await hashPassword(body.data.password);
  const result = await withTransaction(async (client) => {
    const account = await client.query("SELECT password_hash, must_change_password, disabled_at FROM users WHERE id = $1 FOR UPDATE", [user.id]);
    const row = account.rows[0];
    const session = await client.query("SELECT id FROM sessions WHERE user_id = $1 AND token_hash = $2 AND expires_at > now()", [user.id, hashOpaqueToken(token)]);
    if (!row || row.disabled_at || !row.must_change_password || !session.rowCount) return "Password change unavailable";
    if (await verifyPassword(row.password_hash, body.data.password)) return "Choose a different password";
    await client.query("UPDATE users SET password_hash = $1, must_change_password = false, updated_at = now() WHERE id = $2", [hash, user.id]);
    await client.query("DELETE FROM sessions WHERE user_id = $1", [user.id]);
    await client.query("INSERT INTO audit_events(actor_user_id, action, resource_type, resource_id) VALUES ($1, 'user.password_changed', 'user', $1)", [user.id]);
    return null;
  });
  if (result) return NextResponse.json({ error: result }, { status: 400 });
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
