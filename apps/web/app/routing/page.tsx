import { pageUser } from "../../lib/auth";
import { query } from "../../lib/db";
import { routingConfigs } from "../../lib/routing-store";
import { RoutingForm } from "../../components/routing-form";
import { RoutingCard } from "../../components/routing-card";
import { Nav } from "../../components/nav";

export default async function RoutingPage() {
  const user = await pageUser();
  const [connections, configs] = await Promise.all([
    query<{ id: string; name: string }>("SELECT id, name FROM connections WHERE enabled AND (visibility = 'public' OR owner_user_id = $1) ORDER BY name", [user.id]),
    routingConfigs(user.id),
  ]);
  return <main className="shell"><Nav role={user.role} /><h1>Routing</h1><p>Your API keys use your default config. Request a model alias through /v1/chat/completions.</p>
    {!configs.some((config) => config.is_default) && <p role="status">No default config. Select one to activate routing.</p>}
    <details className="connection-card"><summary>Create config</summary><RoutingForm connections={connections.rows} /></details>
    {configs.map((config) => <RoutingCard key={config.id} config={config} connections={connections.rows} />)}
  </main>;
}
