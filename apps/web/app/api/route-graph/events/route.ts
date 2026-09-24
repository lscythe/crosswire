import { currentUser } from "../../../../lib/auth";
import { query } from "../../../../lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  const encoder = new TextEncoder();
  let stopped = false;
  let cursor = new Date(Date.now() - 5_000);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (value: string) => controller.enqueue(encoder.encode(value));
      send(": connected\n\n");
      const timer = setInterval(async () => {
        if (stopped) return;
        try {
          const rows = await query<{
            request_id: string;
            connection_id: string | null;
            status: number;
            latency_ms: number;
            created_at: Date;
          }>(
            user.role === "admin"
              ? "SELECT request_id, connection_id, status, latency_ms, created_at FROM request_logs WHERE created_at > $1 ORDER BY created_at LIMIT 50"
              : "SELECT rl.request_id, rl.connection_id, rl.status, rl.latency_ms, rl.created_at FROM request_logs rl LEFT JOIN connections c ON c.id = rl.connection_id WHERE rl.created_at > $1 AND (rl.user_id = $2 OR c.visibility = 'public') ORDER BY rl.created_at LIMIT 50",
            user.role === "admin" ? [cursor] : [cursor, user.id],
          );
          for (const row of rows.rows) {
            cursor = row.created_at;
            send(
              `id: ${row.request_id}\ndata: ${JSON.stringify({ type: "request", providerId: row.connection_id, status: row.status, latencyMs: row.latency_ms, timestamp: row.created_at.toISOString() })}\n\n`,
            );
          }
          if (!rows.rows.length) send(": heartbeat\n\n");
        } catch {
          send("event: stale\ndata: {}\n\n");
        }
      }, 1000);
      request.signal.addEventListener("abort", () => {
        stopped = true;
        clearInterval(timer);
        controller.close();
      });
    },
    cancel() {
      stopped = true;
    },
  });
  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-store",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
      "X-Accel-Buffering": "no",
    },
  });
}
