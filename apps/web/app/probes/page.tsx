import { CardRoot as Card } from "@heroui/react/card";
import { ChipRoot as Chip } from "@heroui/react/chip";
import { AppShell } from "../../components/app-shell";
import { redirect } from "next/navigation";
import { pageUser } from "../../lib/auth";
import { query } from "../../lib/db";

export default async function ProbesPage() {
  const user = await pageUser();
  if (!user) redirect("/login");
  const result = user.role === "admin" ? await query("SELECT p.id, c.name, p.requested_model, p.claimed_model, p.identity_confidence, p.overall_status, p.created_at FROM probe_runs p JOIN connections c ON c.id = p.connection_id ORDER BY p.created_at DESC") : await query("SELECT p.id, c.name, p.requested_model, p.claimed_model, p.identity_confidence, p.overall_status, p.created_at FROM probe_runs p JOIN connections c ON c.id = p.connection_id WHERE c.visibility = 'public' OR c.owner_user_id = $1 ORDER BY p.created_at DESC", [user.id]);
  return <AppShell user={user}><h1>Model probes</h1><p>Identity confidence is evidence-based; it cannot cryptographically prove model identity.</p><div className="connections-grid">{result.rows.map(probe => <Card className="activity-card" key={probe.id}><div className="probe-heading"><h3>{probe.name}</h3><Chip variant="soft" size="sm" color={probe.overall_status === "passed" ? "success" : probe.overall_status === "failed" ? "danger" : "warning"}>{probe.overall_status}</Chip></div><code className="model-name">{probe.requested_model}</code><p>Identity confidence: {probe.identity_confidence}</p></Card>)}</div>{!result.rows.length && <Card className="activity-card empty-state"><p>No probes yet. Run a model probe from Connections.</p></Card>}</AppShell>;
}
