import { redirect } from "next/navigation";
import { pageUser } from "../../lib/auth";
import { query } from "../../lib/db";
import { RoutingForm } from "../../components/routing-form";

export default async function RoutingPage() {
  const user = await pageUser();
  if (!user) redirect("/login");
  const connections = await query<{ id: string; name: string }>("SELECT id, name FROM connections WHERE enabled AND (visibility = 'public' OR owner_user_id = $1) ORDER BY name", [user.id]);
  const configs = await query<{ id: string; name: string; is_default: boolean }>("SELECT id, name, is_default FROM routing_configs WHERE owner_user_id = $1 ORDER BY created_at DESC", [user.id]);
  return <section><h2>Routing</h2><RoutingForm connections={connections.rows} /><ul>{configs.rows.map((config) => <li key={config.id}>{config.name} · {config.is_default ? "default" : "available"}</li>)}</ul></section>;
}
