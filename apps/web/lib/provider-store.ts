import type { ConnectionView } from "../components/connection-card";
import { query } from "./db";
export async function providerViews(user: { id: string; role: string }) {
  return query<ConnectionView & { owner_user_id: string }>(
    `
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
    ORDER BY c.created_at DESC`,
    [user.id, user.role],
  );
}
