import { query, withTransaction } from "./db";
import type { RoutingConfig, RoutingInput } from "./routing";

export async function routingConfigs(userId: string) {
  const result = await query<RoutingConfig>("SELECT cfg.id, cfg.name, cfg.is_default, COALESCE(json_agg(json_build_object('modelAlias', r.model_alias, 'connectionId', r.connection_id, 'upstreamModel', r.upstream_model, 'priority', r.priority) ORDER BY r.priority, r.model_alias) FILTER (WHERE r.id IS NOT NULL), '[]') AS routes FROM routing_configs cfg LEFT JOIN routing_routes r ON r.config_id = cfg.id WHERE cfg.owner_user_id = $1 GROUP BY cfg.id ORDER BY cfg.created_at DESC", [userId]);
  return result.rows;
}

export async function saveRouting(userId: string, body: RoutingInput, id?: string) {
  return withTransaction(async (client) => {
    await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
    if (id && !(await client.query("SELECT id FROM routing_configs WHERE id = $1 AND owner_user_id = $2", [id, userId])).rowCount) return null;
    const ids = [...new Set(body.routes.map((route) => route.connectionId))];
    const allowed = await client.query("SELECT id FROM connections WHERE id = ANY($1::uuid[]) AND enabled AND (owner_user_id = $2 OR visibility = 'public') FOR SHARE", [ids, userId]);
    if (allowed.rowCount !== ids.length) throw new Error("Route connections must be enabled and accessible");
    if (body.isDefault) await client.query("UPDATE routing_configs SET is_default = false WHERE owner_user_id = $1", [userId]);
    let configId = id;
    if (configId) {
      await client.query("UPDATE routing_configs SET name = $1, is_default = $2, updated_at = now() WHERE id = $3", [body.name, body.isDefault, configId]);
      await client.query("DELETE FROM routing_routes WHERE config_id = $1", [configId]);
    } else {
      const result = await client.query<{ id: string }>("INSERT INTO routing_configs(owner_user_id, name, is_default) VALUES ($1, $2, $3) RETURNING id", [userId, body.name, body.isDefault]);
      configId = result.rows[0].id;
    }
    for (const route of body.routes) await client.query("INSERT INTO routing_routes(config_id, model_alias, connection_id, upstream_model, priority) VALUES ($1, $2, $3, $4, $5)", [configId, route.modelAlias, route.connectionId, route.upstreamModel, route.priority]);
    await client.query("INSERT INTO audit_events(actor_user_id, action, resource_type, resource_id) VALUES ($1, $2, 'routing_config', $3)", [userId, id ? "routing_config.updated" : "routing_config.created", configId]);
    return configId;
  });
}
