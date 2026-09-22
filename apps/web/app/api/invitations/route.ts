import { randomBytes, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";
import { query } from "../../../lib/db";
import { recordAudit } from "../../../lib/audit";
import { invitationSchema } from "../../../lib/validation";

export async function POST(request: Request) {
  const actor = await currentUser();
  if (!actor || actor.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: actor ? 403 : 401 });
  const body = invitationSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid invitation" }, { status: 400 });
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest();
  const result = await query<{ id: string; expires_at: Date }>("INSERT INTO invitations(email, token_hash, role, expires_at, created_by) VALUES ($1, $2, $3, now() + interval '7 days', $4) RETURNING id, expires_at", [body.data.email, tokenHash, body.data.role, actor.id]);
  await recordAudit(actor.id, "invitation.created", "invitation", result.rows[0].id, { email: body.data.email, role: body.data.role });
  return NextResponse.json({ id: result.rows[0].id, token, expiresAt: result.rows[0].expires_at }, { status: 201 });
}
