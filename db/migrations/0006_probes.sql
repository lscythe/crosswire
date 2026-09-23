CREATE TABLE IF NOT EXISTS probe_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  requested_model text NOT NULL,
  claimed_model text,
  identity_confidence text NOT NULL CHECK (identity_confidence IN ('high', 'medium', 'low', 'unknown')),
  overall_status text NOT NULL CHECK (overall_status IN ('passed', 'failed', 'partial')),
  limitation text NOT NULL DEFAULT 'Response behavior cannot cryptographically prove model identity.',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS probe_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  probe_run_id uuid NOT NULL REFERENCES probe_runs(id) ON DELETE CASCADE,
  capability text NOT NULL,
  passed boolean NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS probe_runs_connection_created_idx ON probe_runs(connection_id, created_at DESC);
CREATE INDEX IF NOT EXISTS probe_results_run_idx ON probe_results(probe_run_id);
