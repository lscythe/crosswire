import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { hashPassword } from "../../../../lib/auth/password";
import { withTransaction } from "../../../../lib/db";
import { z } from "zod";

const acceptSchema = z.object({
  token: z.string().min(32),
  email: z.string().email().transform((value) => value.toLowerCase()),
  password: z.string().min(12),
});

export async function POST(request: Request) {
  const body = acceptSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid invitation" }, { status: 400 });
  const tokenHash = createHash("sha256").update(body.data.token).digest();
  const passwordHash = await hashPassword(body.data.password);
  try {
    const account = await withTransaction(async (client) => {
      const invitation = await client.query<{ id: string; email: string; role: "admin" | "member" }>(
        "UPDATE invitations SET accepted_at = now() WHERE token_hash = $1 AND email = $2 AND accepted_at IS NULL AND expires_at > now() RETURNING id, email, role",
        [tokenHash, body.data.email],
      );
      const row = invitation.rows[0];
      if (!row) return null;
      await client.query("INSERT INTO users(email, password_hash, role) VALUES ($1, $2, $3)", [row.email, passwordHash, row.role]);
      return { email: row.email, role: row.role };
    });
    return account ? NextResponse.json(account, { status: 201 }) : NextResponse.json({ error: "invalid invitation" }, { status: 400 });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return NextResponse.json({ error: "account exists" }, { status: 409 });
    throw error;
  }
}
