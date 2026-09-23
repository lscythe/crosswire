CREATE INDEX IF NOT EXISTS probe_runs_status_created_idx ON probe_runs(overall_status, created_at DESC);
