CREATE TABLE provider_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  ciphertext text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  last_tested_at timestamptz,
  last_test_status text CHECK (last_test_status IN ('passed', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider_id, id)
);
ALTER TABLE connections ADD COLUMN key_mode text NOT NULL DEFAULT 'selected' CHECK (key_mode IN ('selected', 'round_robin'));
ALTER TABLE connections ADD COLUMN selected_key_id uuid;
INSERT INTO provider_keys(provider_id, name, ciphertext) SELECT id, 'Default', api_key_ciphertext FROM connections;
UPDATE connections c SET selected_key_id = k.id FROM provider_keys k WHERE k.provider_id = c.id;
ALTER TABLE connections ADD CONSTRAINT selected_provider_key FOREIGN KEY (id, selected_key_id) REFERENCES provider_keys(provider_id, id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE connections DROP COLUMN api_key_ciphertext;

CREATE TABLE provider_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  upstream_id text NOT NULL CHECK (length(upstream_id) BETWEEN 1 AND 200),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 200),
  enabled boolean NOT NULL DEFAULT true,
  imported_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  discovered_by_key_id uuid REFERENCES provider_keys(id) ON DELETE SET NULL,
  imported_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider_id, upstream_id)
);
ALTER TABLE probe_runs ADD COLUMN provider_key_id uuid REFERENCES provider_keys(id) ON DELETE SET NULL;

-- Only forwarding rotates keys. Manual probes/imports explicitly choose a key.
CREATE FUNCTION select_provider_key(provider_uuid uuid) RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  provider connections%ROWTYPE;
  credential provider_keys%ROWTYPE;
BEGIN
  SELECT * INTO provider FROM connections WHERE id = provider_uuid AND enabled FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO credential FROM provider_keys
    WHERE provider_id = provider_uuid AND enabled
      AND (provider.key_mode = 'round_robin' OR id = provider.selected_key_id)
    ORDER BY last_used_at NULLS FIRST, created_at, id LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE provider_keys SET last_used_at = clock_timestamp() WHERE id = credential.id;
  RETURN credential.ciphertext;
END;
$$;
