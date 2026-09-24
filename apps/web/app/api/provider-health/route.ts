import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";
import { query } from "../../../lib/db";
import { decryptSecret } from "../../../lib/secrets";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const routes = await query<{
    id: string;
    name: string;
    base_url: string;
    api_key_ciphertext: string;
  }>(
    "SELECT DISTINCT c.id, c.name, c.base_url, k.ciphertext AS api_key_ciphertext FROM routing_configs cfg JOIN routing_routes r ON r.config_id = cfg.id JOIN connections c ON c.id = r.connection_id JOIN provider_keys k ON k.provider_id = c.id AND k.id = c.selected_key_id AND k.enabled WHERE cfg.owner_user_id = $1 AND cfg.is_default AND c.enabled AND (c.owner_user_id = $1 OR c.visibility = 'public')",
    [user.id],
  );
  const providers = await Promise.all(
    routes.rows.map(async (route) => {
      const started = Date.now();
      try {
        const response = await fetch(`${route.base_url.replace(/\/$/, "")}/models`, {
          headers: { Authorization: `Bearer ${decryptSecret(route.api_key_ciphertext)}` },
          redirect: "error",
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        });
        await response.body?.cancel();
        return {
          id: route.id,
          name: route.name,
          status: response.ok ? "healthy" : "degraded",
          httpStatus: response.status,
          latencyMs: Date.now() - started,
        };
      } catch {
        return {
          id: route.id,
          name: route.name,
          status: "unreachable",
          httpStatus: 0,
          latencyMs: Date.now() - started,
        };
      }
    }),
  );
  return NextResponse.json({ providers }, { headers: { "Cache-Control": "no-store" } });
}
