import { NextResponse } from "next/server";
import { createSession } from "../../../../lib/auth/session";
import { sessionCookie, sessionRepository } from "../../../../lib/auth";
import { query } from "../../../../lib/db";
import { verifyPassword } from "../../../../lib/auth/password";
import { credentialsSchema } from "../../../../lib/validation";

export async function POST(request: Request) {
  const body = credentialsSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid credentials" }, { status: 400 });
  const result = await query<{ id: string; email: string; name: string; role: "admin" | "member"; password_hash: string; disabled_at: Date | null }>("SELECT id, email, name, role, password_hash, disabled_at FROM users WHERE email = $1", [body.data.email]);
  const user = result.rows[0];
  if (!user || user.disabled_at || !(await verifyPassword(user.password_hash, body.data.password))) return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  const token = await createSession(sessionRepository, user.id);
  const response = NextResponse.json({ id: user.id, email: user.email, name: user.name, role: user.role });
  response.cookies.set(sessionCookie(token, new Date(Date.now() + 1000 * 60 * 60 * 24 * 7)));
  return response;
}
