import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { query } from "./db";
import { hashOpaqueToken, lookupSession, type SessionRepository } from "./auth/session";

const SESSION_COOKIE = "crosswire_session";

const repository: SessionRepository = {
  async insert(record) {
    await query("INSERT INTO sessions(id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)", [record.id, record.userId, record.tokenHash, record.expiresAt]);
  },
  async findByHash(hash) {
    const result = await query<{ id: string; user_id: string; token_hash: Buffer; expires_at: Date }>("SELECT id, user_id, token_hash, expires_at FROM sessions WHERE token_hash = $1", [hash]);
    const row = result.rows[0];
    return row ? { id: row.id, userId: row.user_id, tokenHash: row.token_hash, expiresAt: row.expires_at } : null;
  },
  async deleteById(id) {
    await query("DELETE FROM sessions WHERE id = $1", [id]);
  },
};

export async function currentUser(allowPasswordChange = false) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await lookupSession(repository, token);
  if (!session) return null;
  const result = await query<{ id: string; email: string; name: string; role: "admin" | "member"; disabled_at: Date | null; must_change_password: boolean }>("SELECT id, email, name, role, disabled_at, must_change_password FROM users WHERE id = $1", [session.userId]);
  const user = result.rows[0];
  return user && !user.disabled_at && (allowPasswordChange || !user.must_change_password) ? { id: user.id, email: user.email, name: user.name, role: user.role, mustChangePassword: user.must_change_password } : null;
}

export function sessionCookie(token: string, expiresAt: Date) {
  return { name: SESSION_COOKIE, value: token, httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", expires: expiresAt };
}

export { hashOpaqueToken, SESSION_COOKIE, repository as sessionRepository };

export async function pageUser() {
  const user = await currentUser(true);
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  return user;
}
