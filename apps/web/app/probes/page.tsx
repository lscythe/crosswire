import { AppShell } from "../../components/app-shell";
import { redirect } from "next/navigation";
import { pageUser } from "../../lib/auth";
import { query } from "../../lib/db";

export default async function ProbesPage() {
  const user = await pageUser();
  if (!user) redirect("/login");
  const result = user.role === "admin" ? await query("SELECT p.id, c.name, p.requested_model, p.claimed_model, p.identity_confidence, p.overall_status, p.created_at FROM probe_runs p JOIN connections c ON c.id = p.connection_id ORDER BY p.created_at DESC") : await query("SELECT p.id, c.name, p.requested_model, p.claimed_model, p.identity_confidence, p.overall_status, p.created_at FROM probe_runs p JOIN connections c ON c.id = p.connection_id WHERE c.visibility = 'public' OR c.owner_user_id = $1 ORDER BY p.created_at DESC", [user.id]);
  return <AppShell user={user}><h1>Model probes</h1><p>Identity confidence is evidence-based; it cannot cryptographically prove model identity.</p><ul>{result.rows.map((probe) => <li key={probe.id}>{probe.name} · {probe.requested_model} · identity {probe.identity_confidence} · {probe.overall_status}</li>)}</ul></AppShell>;
}
