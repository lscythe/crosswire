import { redirect } from "next/navigation";
import { currentUser } from "../../lib/auth";
import { query } from "../../lib/db";

export default async function UsagePage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const filter = user.role === "admin" ? "" : "WHERE user_id = $1";
  const values = user.role === "admin" ? [] : [user.id];
  const summary = await query(`SELECT count(*)::int AS requests, coalesce(round(avg(latency_ms)), 0)::int AS average_latency_ms FROM usage_events ${filter}`, values);
  const logs = await query(`SELECT request_id, model, status, latency_ms, error_reason, created_at FROM request_logs ${filter} ORDER BY created_at DESC LIMIT 50`, values);
  return <section><h2>Usage</h2><p>{summary.rows[0].requests} requests · {summary.rows[0].average_latency_ms}ms average latency</p><h3>Recent requests</h3><ul>{logs.rows.map((log) => <li key={log.request_id}>{log.model} · {log.status} · {log.latency_ms}ms{log.error_reason ? ` · ${log.error_reason}` : ""}</li>)}</ul></section>;
}
