import { AppShell } from "../../components/app-shell";
import { pageUser } from "../../lib/auth";
import { query } from "../../lib/db";
import { ConnectionForm } from "../../components/connection-form";
import { ConnectionCard, type ConnectionView } from "../../components/connection-card";


export default async function ConnectionsPage() {
  const user = await pageUser();
  const result = await query<ConnectionView & { owner_user_id: string }>(`
    SELECT c.id, c.owner_user_id, c.name, c.base_url, c.visibility, c.enabled, c.last_test_status, c.requests_per_minute, c.requests_per_day,
      COALESCE((SELECT json_agg(json_build_object('user', u.email, 'used', q.day_used) ORDER BY u.email)
        FROM connection_quotas q JOIN users u ON u.id = q.user_id
        WHERE q.connection_id = c.id AND q.day_start = (now() AT TIME ZONE 'UTC')::date
        AND ($2 = 'admin' OR c.owner_user_id = $1 OR q.user_id = $1)), '[]'::json) AS "quotaUsage",
      (SELECT json_build_object('requestedModel', p.requested_model, 'returnedModel', p.claimed_model,
        'identityConfidence', p.identity_confidence, 'status', p.overall_status,
        'checks', COALESCE((SELECT json_agg(json_build_object('capability', r.capability, 'passed', r.passed, 'evidence', r.evidence)) FROM probe_results r WHERE r.probe_run_id = p.id), '[]'::json))
       FROM probe_runs p WHERE p.connection_id = c.id ORDER BY p.created_at DESC LIMIT 1) AS "latestProbe"
    FROM connections c WHERE $2 = 'admin' OR c.visibility = 'public' OR c.owner_user_id = $1
    ORDER BY c.created_at DESC`, [user.id, user.role]);
  return <AppShell user={user}><h1>Connections</h1>
    <p>Manage provider access and check model behavior.</p>
    <details className="connection-card"><summary>Add connection</summary><ConnectionForm /></details>
    {result.rows.length === 0 && <p>No connections available. Add your first provider above.</p>}
    <div className="connections-grid">{result.rows.map(({ owner_user_id, ...connection }) => <ConnectionCard key={connection.id} connection={{ ...connection, canManage: user.role === "admin" || owner_user_id === user.id }} />)}</div>
  </AppShell>;
}
