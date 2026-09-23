CREATE TABLE IF NOT EXISTS request_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  connection_id uuid REFERENCES connections(id) ON DELETE SET NULL,
  model text NOT NULL,
  status integer NOT NULL,
  latency_ms integer NOT NULL,
  error_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS request_logs_created_idx ON request_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS request_logs_user_created_idx ON request_logs(user_id, created_at DESC);
