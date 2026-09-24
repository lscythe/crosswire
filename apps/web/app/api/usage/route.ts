import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";
import { query } from "../../../lib/db";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const filter = user.role === "admin" ? "" : "WHERE user_id = $1";
  const values = user.role === "admin" ? [] : [user.id];
  const summary = await query(
    `SELECT count(*)::int AS requests, coalesce(sum(input_tokens), 0)::int AS input_tokens, coalesce(sum(output_tokens), 0)::int AS output_tokens, coalesce(round(avg(latency_ms)), 0)::int AS average_latency_ms FROM usage_events ${filter}`,
    values,
  );
  const byModel = await query(
    `SELECT model, count(*)::int AS requests, coalesce(round(avg(latency_ms)), 0)::int AS average_latency_ms FROM usage_events ${filter} GROUP BY model ORDER BY requests DESC`,
    values,
  );
  return NextResponse.json({ summary: summary.rows[0], byModel: byModel.rows });
}
