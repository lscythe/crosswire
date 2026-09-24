import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";
import { query } from "../../../lib/db";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result =
    user.role === "admin"
      ? await query(
          "SELECT request_id, connection_id, model, status, latency_ms, error_reason, attempts, created_at FROM request_logs ORDER BY created_at DESC LIMIT 100",
        )
      : await query(
          "SELECT request_id, connection_id, model, status, latency_ms, error_reason, attempts, created_at FROM request_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100",
          [user.id],
        );
  return NextResponse.json({ requests: result.rows });
}
