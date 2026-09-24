import { CardRoot as Card } from "@heroui/react/card";
import { AppShell } from "../../components/app-shell";

import { pageUser } from "../../lib/auth";
import { query } from "../../lib/db";

export default async function UsagePage() {
  const user = await pageUser();
  const filter = user.role === "admin" ? "" : "WHERE user_id = $1";
  const values = user.role === "admin" ? [] : [user.id];
  const summary = await query(
    `SELECT count(*)::int AS requests, coalesce(round(avg(latency_ms)), 0)::int AS average_latency_ms FROM usage_events ${filter}`,
    values,
  );
  const logs = await query<{
    request_id: string;
    model: string;
    status: number;
    latency_ms: number;
    error_reason: string | null;
    attempts: Array<{
      connectionId: string;
      connectionName: string;
      upstreamModel: string;
      status: number;
      reason: string;
    }>;
  }>(
    `SELECT request_id, model, status, latency_ms, error_reason, attempts, created_at FROM request_logs ${filter} ORDER BY created_at DESC LIMIT 50`,
    values,
  );
  return (
    <AppShell user={user}>
      <h1>Usage</h1>
      <p>
        {summary.rows[0].requests} upstream responses · {summary.rows[0].average_latency_ms}ms
        average latency
      </p>
      <h2>Recent requests</h2>
      {logs.rows.map((log, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: Request log snapshot is immutable and may repeat request IDs.
        <Card role="article" className="connection-card" key={`${log.request_id}-${index}`}>
          <h3>
            {log.model} · HTTP {log.status}
          </h3>
          <p>
            Request {log.request_id} · {log.latency_ms}ms
          </p>
          {log.error_reason && <p>{log.error_reason}</p>}
          <p>
            Served by:{" "}
            {[...log.attempts]
              .reverse()
              .find(
                (attempt) =>
                  attempt.reason === "response served" ||
                  attempt.reason === "upstream response interrupted",
              )?.connectionName ?? "No response served / older request"}
          </p>
          <details>
            <summary>Routing attempts ({log.attempts.length})</summary>
            <ol>
              {log.attempts.map((attempt, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: Attempt order in a completed request is immutable.
                <li key={i}>
                  {attempt.connectionName} · {attempt.upstreamModel} ·{" "}
                  {attempt.status ? `HTTP ${attempt.status}` : "No HTTP response"} ·{" "}
                  {attempt.reason}
                </li>
              ))}
            </ol>
          </details>
        </Card>
      ))}
    </AppShell>
  );
}
