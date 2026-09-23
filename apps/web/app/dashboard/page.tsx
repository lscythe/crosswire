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
  return <>
    <div className="dashboard-heading"><div><h1>Dashboard</h1><p>{personal ? "Your" : "Team"} gateway activity · Last 24 hours</p></div><a href={personal ? "/dashboard?scope=mine" : "/dashboard"}>Refresh</a></div>
    <nav className="connection-actions" aria-label="Usage scope"><Link href="/dashboard" aria-current={!personal ? "page" : undefined}>Team usage</Link><Link href="/dashboard?scope=mine" aria-current={personal ? "page" : undefined}>My usage</Link></nav>
    <dl className="dashboard-stats">
      <div><dt>Requests</dt><dd>{format(stats.requests)}</dd></div>
      <div><dt>Success rate</dt><dd>{stats.requests ? `${Math.round(stats.succeeded / stats.requests * 100)}%` : "—"}</dd></div>
      <div><dt>Failed requests</dt><dd>{format(stats.requests - stats.succeeded)}</dd></div>
      <div><dt>Average latency</dt><dd>{stats.average_latency_ms === null ? "—" : `${format(stats.average_latency_ms)} ms`}</dd></div>
    </dl>
    <section className="connection-card"><h3>Recent requests</h3><p>Latest 10 in this view. Failed requests include interrupted responses.</p>
      {requests.rows.length ? <ul className="dashboard-list">{requests.rows.map(request => <li key={request.id}><strong>{request.model}</strong><span>{request.error_reason ? "Failed · " : ""}HTTP {request.status} · {format(request.latency_ms)} ms</span></li>)}</ul> : <p>No requests in the last 24 hours. <Link href="/api-access">Connect a client</Link> to get started.</p>}
      <Link href="/usage">Request details</Link>
    </section>
    <div className="connections-grid">
      <section className="connection-card"><h3>Connections</h3><p>{connections.rows.filter(connection => connection.enabled).length} enabled of {connections.rows.length} visible. Saved test results; not live health.</p>
        {connections.rows.length ? <ul className="dashboard-list">{connections.rows.map(connection => <li key={connection.id}><strong>{connection.name}</strong><span>{connection.enabled ? "Enabled" : "Disabled"} · {connection.last_test_status ? `Last test ${connection.last_test_status}` : "Not tested"}{connection.last_tested_at && <> · <time dateTime={new Date(connection.last_tested_at).toISOString()}>{new Date(connection.last_tested_at).toISOString().replace("T", " ").slice(0, 16)} UTC</time></>}</span></li>)}</ul> : <p>No connections available. Add a provider to start routing.</p>}
        <Link href="/connections">Manage connections</Link>
      </section>
      <section className="connection-card"><h3>Latest model probes</h3><p>Identity confidence is evidence, not proof of the underlying model.</p>
        {probes.rows.length ? <ul className="dashboard-list">{probes.rows.map(probe => <li key={probe.id}><strong>{probe.name} · {probe.requested_model}</strong><span>{probe.overall_status} · Identity confidence: {probe.identity_confidence}</span></li>)}</ul> : <p>No probe results available. Run a model probe from Connections.</p>}
        <Link href="/probes">View probes</Link>
      </section>
    </div>
  </>;
}
