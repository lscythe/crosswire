CREATE TABLE IF NOT EXISTS routing_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS routing_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL REFERENCES routing_configs(id) ON DELETE CASCADE,
  model_alias text NOT NULL,
  connection_id uuid NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  upstream_model text NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  UNIQUE(config_id, model_alias, priority)
);

CREATE TABLE IF NOT EXISTS usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  connection_id uuid REFERENCES connections(id) ON DELETE SET NULL,
  model text NOT NULL,
  status integer NOT NULL,
  latency_ms integer NOT NULL,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
