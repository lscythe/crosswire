import { redirect } from "next/navigation";
import { currentUser } from "../../lib/auth";
import { query } from "../../lib/db";
import { ConnectionForm } from "../../components/connection-form";

export default async function ConnectionsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const result = user.role === "admin"
    ? await query("SELECT id, name, base_url, visibility, enabled, last_test_status FROM connections ORDER BY created_at DESC")
    : await query("SELECT id, name, base_url, visibility, enabled, last_test_status FROM connections WHERE visibility = 'public' OR owner_user_id = $1 ORDER BY created_at DESC", [user.id]);
  return <section><h2>Connections</h2><ConnectionForm /><ul>{result.rows.map((connection) => <li key={connection.id}>{connection.name} <small>{connection.base_url} · {connection.visibility} · {connection.enabled ? "enabled" : "disabled"} · {connection.last_test_status ?? "untested"}</small></li>)}</ul></section>;
}
