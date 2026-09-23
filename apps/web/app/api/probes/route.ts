import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";
import { query } from "../../../lib/db";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = user.role === "admin"
    ? await query("SELECT p.id, p.connection_id, c.name, p.requested_model, p.claimed_model, p.identity_confidence, p.overall_status, p.created_at FROM probe_runs p JOIN connections c ON c.id = p.connection_id ORDER BY p.created_at DESC")
    : await query("SELECT p.id, p.connection_id, c.name, p.requested_model, p.claimed_model, p.identity_confidence, p.overall_status, p.created_at FROM probe_runs p JOIN connections c ON c.id = p.connection_id WHERE c.visibility = 'public' OR c.owner_user_id = $1 ORDER BY p.created_at DESC", [user.id]);
  return NextResponse.json({ probes: result.rows });
}
