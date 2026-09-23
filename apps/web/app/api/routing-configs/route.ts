import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";
import { query, withTransaction } from "../../../lib/db";
import { recordAudit } from "../../../lib/audit";
import { z } from "zod";

const schema = z.object({ name: z.string().trim().min(1).max(100), isDefault: z.boolean().default(false), routes: z.array(z.object({ modelAlias: z.string().min(1).max(100), connectionId: z.string().uuid(), upstreamModel: z.string().min(1).max(200), priority: z.number().int().min(0).max(1000) })).min(1) });

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await query("SELECT cfg.id, cfg.name, cfg.is_default, COALESCE(json_agg(json_build_object('modelAlias', r.model_alias, 'connectionId', r.connection_id, 'upstreamModel', r.upstream_model, 'priority', r.priority) ORDER BY r.priority) FILTER (WHERE r.id IS NOT NULL), '[]') AS routes FROM routing_configs cfg LEFT JOIN routing_routes r ON r.config_id = cfg.id WHERE cfg.owner_user_id = $1 GROUP BY cfg.id ORDER BY cfg.created_at DESC", [user.id]);
  return NextResponse.json({ configs: result.rows });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "invalid routing config" }, { status: 400 });
  try {
    const id = await withTransaction(async (client) => {
      if (body.data.isDefault) await client.query("UPDATE routing_configs SET is_default = false WHERE owner_user_id = $1", [user.id]);
      const config = await client.query<{ id: string }>("INSERT INTO routing_configs(owner_user_id, name, is_default) VALUES ($1, $2, $3) RETURNING id", [user.id, body.data.name, body.data.isDefault]);
      for (const route of body.data.routes) await client.query("INSERT INTO routing_routes(config_id, model_alias, connection_id, upstream_model, priority) SELECT $1, $2, $3, $4, $5 WHERE EXISTS (SELECT 1 FROM connections WHERE id = $3 AND (owner_user_id = $6 OR visibility = 'public'))", [config.rows[0].id, route.modelAlias, route.connectionId, route.upstreamModel, route.priority, user.id]);
      return config.rows[0].id;
    });
    await recordAudit(user.id, "routing_config.created", "routing_config", id);
    return NextResponse.json({ id }, { status: 201 });
  } catch { return NextResponse.json({ error: "could not create routing config" }, { status: 400 }); }
}
