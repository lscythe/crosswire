import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";
import { hashPassword } from "../../../lib/auth/password";
import { withTransaction } from "../../../lib/db";
import { createUserSchema } from "../../../lib/validation";

export async function POST(request: Request) {
  const actor = await currentUser();
  if (actor?.role !== "admin")
    return NextResponse.json({ error: "forbidden" }, { status: actor ? 403 : 401 });
  const body = createUserSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid user" }, { status: 400 });
  const temporaryPassword = randomBytes(24).toString("base64url");
  const hash = await hashPassword(temporaryPassword);
  try {
    const user = await withTransaction(async (client) => {
      const result = await client.query(
        "INSERT INTO users(username, email, role, password_hash, must_change_password) VALUES ($1, $2, $3, $4, true) RETURNING id, username, email, role",
        [body.data.username, body.data.email, body.data.role, hash],
      );
      await client.query(
        "INSERT INTO audit_events(actor_user_id, action, resource_type, resource_id) VALUES ($1, 'user.created', 'user', $2)",
        [actor.id, result.rows[0].id],
      );
      return result.rows[0];
    });
    return NextResponse.json(
      { ...user, temporaryPassword },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if ((error as { code?: string }).code === "23505")
      return NextResponse.json({ error: "account exists" }, { status: 409 });
    throw error;
  }
}
