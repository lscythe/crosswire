import { CardRoot as Card } from "@heroui/react/card";
import { ChipRoot as Chip } from "@heroui/react/chip";
import { IconArrowUpRight, IconArrowRight, IconActivity, IconCircleCheck, IconAlertTriangle, IconClock, IconRefresh, IconPlugConnected, IconShieldCheck, IconKey } from "@tabler/icons-react";
import Link from "next/link";
import { pageUser } from "../../lib/auth";
import { query } from "../../lib/db";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const user = await pageUser();
  const personal = (await searchParams).scope === "mine";
  const window = "created_at >= now() - interval '24 hours'";
  const filter = `${window}${personal ? " AND user_id = $1" : ""}`;
  const values = personal ? [user.id] : [];
  const visibility = user.role === "admin" ? "TRUE" : "(c.visibility = 'public' OR c.owner_user_id = $1)";
  const accessValues = user.role === "admin" ? [] : [user.id];
  const [summary, requests, connections, probes] = await Promise.all([
    query<{ requests: number; succeeded: number; average_latency_ms: number | null }>(`SELECT count(*)::int AS requests, count(*) FILTER (WHERE status >= 200 AND status < 300 AND error_reason IS NULL)::int AS succeeded, round(avg(latency_ms))::int AS average_latency_ms FROM request_logs WHERE ${filter}`, values),
    query<{ id: string; model: string; status: number; latency_ms: number; error_reason: string | null }>(`SELECT id, model, status, latency_ms, error_reason FROM request_logs WHERE ${filter} ORDER BY created_at DESC LIMIT 10`, values),
    query<{ id: string; name: string; enabled: boolean; last_test_status: string | null; last_tested_at: Date | null }>(`SELECT c.id, c.name, c.enabled, c.last_test_status, c.last_tested_at FROM connections c WHERE ${visibility} ORDER BY c.name`, accessValues),
    query<{ id: string; name: string; requested_model: string; overall_status: string; identity_confidence: string }>(`SELECT p.id, c.name, p.requested_model, p.overall_status, p.identity_confidence FROM probe_runs p JOIN connections c ON c.id = p.connection_id WHERE ${visibility} ORDER BY p.created_at DESC LIMIT 5`, accessValues),
  ]);
  const stats = summary.rows[0];
  const format = (value: number) => value.toLocaleString("en-US");
  const successRate = stats.requests ? Math.round(stats.succeeded / stats.requests * 100) : null;
  return <>
    <div className="dashboard-heading"><div><div className="eyebrow">Workspace overview</div><h1>Dashboard</h1><p>{personal ? "Your" : "Team"} gateway activity · Last 24 hours</p></div><div className="connection-actions"><a className="button button--secondary" href={personal ? "/dashboard?scope=mine" : "/dashboard"}><IconRefresh size={16} aria-hidden="true" />Refresh</a><Link className="button button--primary" href="/api-access"><IconKey size={17} aria-hidden="true" />API access<IconArrowUpRight size={16} aria-hidden="true" /></Link></div></div>
    <nav className="scope-switch" aria-label="Usage scope"><Link href="/dashboard" aria-current={!personal ? "page" : undefined}>Team usage</Link><Link href="/dashboard?scope=mine" aria-current={personal ? "page" : undefined}>My usage</Link></nav>
    <div className="dashboard-stats">
      <Card className="metric-card metric-featured"><div className="metric-top"><span>Requests</span><span className="metric-icon"><IconActivity size={20} aria-hidden="true" /></span></div><div className="metric-value">{format(stats.requests)}</div><span className="metric-caption">Across {personal ? "your" : "team"} API keys</span></Card>
      <Card className="metric-card"><div className="metric-top"><span>Success rate</span><span className="metric-icon success"><IconCircleCheck size={20} aria-hidden="true" /></span></div><div className="metric-value">{successRate === null ? "—" : `${successRate}%`}</div><span className="metric-caption">Completed without errors</span></Card>
      <Card className="metric-card"><div className="metric-top"><span>Failed requests</span><span className="metric-icon warning"><IconAlertTriangle size={20} aria-hidden="true" /></span></div><div className="metric-value">{format(stats.requests - stats.succeeded)}</div><span className="metric-caption">Including interrupted responses</span></Card>
      <Card className="metric-card"><div className="metric-top"><span>Average latency</span><span className="metric-icon"><IconClock size={20} aria-hidden="true" /></span></div><div className="metric-value">{stats.average_latency_ms === null ? "—" : `${format(stats.average_latency_ms)} ms`}</div><span className="metric-caption">Across recorded requests</span></Card>
    </div>
    <Card className="activity-card"><div className="panel-heading"><div><h3><IconActivity size={19} aria-hidden="true" />Recent requests</h3><p>The latest 10 requests in this view.</p></div><Link className="text-link" href="/usage">Request details<IconArrowUpRight size={17} aria-hidden="true" /></Link></div>
      {requests.rows.length ? <div className="request-table-wrap"><table className="request-table"><thead><tr><th scope="col">Model</th><th scope="col">Response</th><th scope="col">Latency</th></tr></thead><tbody>{requests.rows.map(request => <tr key={request.id}><td><span className="model-name">{request.model}</span></td><td><Chip size="sm" variant="soft" color={request.status >= 200 && request.status < 300 && !request.error_reason ? "success" : "danger"}>{request.error_reason ? "Failed · " : ""}HTTP {request.status}</Chip></td><td className="latency-value">{format(request.latency_ms)} ms</td></tr>)}</tbody></table></div> : <div className="empty-state"><IconActivity size={32} aria-hidden="true" /><p>No requests in the last 24 hours.</p><Link href="/api-access">Connect a client<IconArrowRight size={16} aria-hidden="true" /></Link></div>}
    </Card>
    <div className="connections-grid dashboard-bottom">
      <Card className="activity-card"><div className="panel-heading"><div><h3><IconPlugConnected size={19} aria-hidden="true" />Connections</h3><p>{connections.rows.filter(connection => connection.enabled).length} enabled of {connections.rows.length} visible</p></div><Link className="icon-link" href="/connections" aria-label="Manage connections"><IconArrowUpRight size={20} aria-hidden="true" /></Link></div>
        <p className="panel-note">Saved test results · not live health</p>
        {connections.rows.length ? <ul className="provider-list">{connections.rows.map(connection => <li key={connection.id}><span className="provider-avatar" aria-hidden="true">{connection.name.slice(0, 1).toUpperCase()}</span><div><strong>{connection.name}</strong><span>{connection.enabled ? "Enabled" : "Disabled"}{connection.last_tested_at && <> · <time dateTime={new Date(connection.last_tested_at).toISOString()}>{new Date(connection.last_tested_at).toISOString().slice(0, 10)}</time></>}</span></div><Chip size="sm" variant="soft" color={!connection.enabled ? "default" : connection.last_test_status === "passed" ? "success" : connection.last_test_status === "failed" ? "danger" : "default"}>{!connection.enabled ? "Disabled" : connection.last_test_status ? `Test ${connection.last_test_status}` : "Not tested"}</Chip></li>)}</ul> : <div className="empty-state"><IconPlugConnected size={30} aria-hidden="true" /><p>No connections available.</p><Link href="/connections">Add a provider<IconArrowRight size={16} aria-hidden="true" /></Link></div>}
      </Card>
      <Card className="activity-card"><div className="panel-heading"><div><h3><IconShieldCheck size={19} aria-hidden="true" />Latest model probes</h3><p>Model behavior &amp; identity evidence</p></div><Link className="icon-link" href="/probes" aria-label="View probes"><IconArrowUpRight size={20} aria-hidden="true" /></Link></div>
        {probes.rows.length ? <ul className="probe-list">{probes.rows.map(probe => <li key={probe.id}><div className="probe-heading"><strong>{probe.name}</strong><Chip size="sm" variant="soft" color={probe.overall_status === "passed" ? "success" : probe.overall_status === "failed" ? "danger" : "warning"}>{probe.overall_status}</Chip></div><code>{probe.requested_model}</code><div className="probe-confidence"><IconShieldCheck size={15} aria-hidden="true" />Identity confidence: <strong>{probe.identity_confidence}</strong></div></li>)}</ul> : <div className="empty-state"><IconShieldCheck size={30} aria-hidden="true" /><p>No probe results available.</p><Link href="/connections">Run a model probe<IconArrowRight size={16} aria-hidden="true" /></Link></div>}
        <p className="panel-note">Identity confidence is evidence, not proof of the underlying model.</p>
      </Card>
    </div>
  </>;
}
