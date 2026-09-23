import { pageUser } from "../../lib/auth";
import { query } from "../../lib/db";
import { gatewayUrl } from "../../lib/gateway-url";
import { Nav } from "../../components/nav";
import { ApiAccess, type KeyView } from "../../components/api-access";

export default async function ApiAccessPage() {
  const user = await pageUser();
  const [keys, models] = await Promise.all([
    query<KeyView>("SELECT id, name, key_prefix, revoked_at FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC", [user.id]),
    query<{ model_alias: string }>("SELECT DISTINCT r.model_alias FROM routing_configs cfg JOIN routing_routes r ON r.config_id = cfg.id JOIN connections c ON c.id = r.connection_id WHERE cfg.owner_user_id = $1 AND cfg.is_default AND c.enabled AND (c.owner_user_id = $1 OR c.visibility = 'public') ORDER BY r.model_alias", [user.id]),
  ]);
  return <main className="shell"><Nav role={user.role} /><h1>API access</h1><ApiAccess keys={keys.rows.map(key => ({ ...key, revoked_at: key.revoked_at ? String(key.revoked_at) : null }))} models={models.rows.map(model => model.model_alias)} baseUrl={gatewayUrl(process.env.PUBLIC_BASE_URL ?? "http://localhost:3000")} /></main>;
}
