import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";
import { query } from "../../../lib/db";
import {
  type GraphProvider,
  type GraphSnapshot,
  providerLogo,
  statusFromHealth,
} from "../../../lib/route-graph";

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const scope = new URL(request.url).searchParams.get("scope") === "all" ? "all" : "default";
  const visibility =
    user.role === "admin" ? "TRUE" : "(c.owner_user_id = $1 OR c.visibility = 'public')";
  const values = user.role === "admin" ? [] : [user.id];
  const result = await query<{
    id: string;
    name: string;
    enabled: boolean;
    last_test_status: string | null;
    latency_ms: number | null;
    last_request_at: Date | null;
  }>(
    `SELECT c.id, c.name, c.enabled, c.last_test_status,
       (SELECT round(avg(rl.latency_ms))::int FROM request_logs rl WHERE rl.connection_id = c.id AND rl.created_at >= now() - interval '24 hours') AS latency_ms,
       (SELECT max(rl.created_at) FROM request_logs rl WHERE rl.connection_id = c.id) AS last_request_at
     FROM connections c
     WHERE ${scope === "default" ? `EXISTS (SELECT 1 FROM routing_configs cfg JOIN routing_routes rr ON rr.config_id = cfg.id WHERE cfg.owner_user_id = $${values.length + 1} AND cfg.is_default AND rr.connection_id = c.id) AND ` : ""}${visibility}
     ORDER BY c.name`,
    scope === "default" ? [...values, user.id] : values,
  );
  const providers: GraphProvider[] = result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    status: statusFromHealth(
      row.enabled,
      row.last_test_status === "passed"
        ? "healthy"
        : row.last_test_status === "failed"
          ? "degraded"
          : null,
    ),
    latencyMs: row.latency_ms,
    lastRequestAt: row.last_request_at?.toISOString() ?? null,
    logoKey: providerLogo(row.name),
  }));
  const snapshot: GraphSnapshot = { providers, updatedAt: new Date().toISOString(), scope };
  return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
}
