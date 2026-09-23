ALTER TABLE connections ADD COLUMN requests_per_minute integer NOT NULL DEFAULT 60 CHECK (requests_per_minute BETWEEN 1 AND 10000);
ALTER TABLE connections ADD COLUMN requests_per_day integer NOT NULL DEFAULT 1000 CHECK (requests_per_day BETWEEN 1 AND 1000000);

CREATE TABLE connection_quotas (
  connection_id uuid NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  minute_start timestamptz NOT NULL,
  day_start date NOT NULL,
  minute_used integer NOT NULL DEFAULT 0 CHECK (minute_used >= 0),
  day_used integer NOT NULL DEFAULT 0 CHECK (day_used >= 0),
  PRIMARY KEY (connection_id, user_id)
);

-- One atomic reservation shared by gateway forwarding and control-plane probes.
-- Returns 0 when allowed, positive Retry-After seconds when limited, -1 when inaccessible.
CREATE FUNCTION reserve_connection_requests(connection_uuid uuid, user_uuid uuid, amount integer DEFAULT 1)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  provider connections%ROWTYPE;
  quota connection_quotas%ROWTYPE;
  checked_at timestamptz := clock_timestamp();
  current_day date := (checked_at AT TIME ZONE 'UTC')::date;
  current_minute timestamptz := date_trunc('minute', checked_at);
BEGIN
  IF amount IS NULL OR amount < 1 OR amount > 2 THEN RAISE EXCEPTION 'invalid reservation amount'; END IF;
  SELECT * INTO provider FROM connections
    WHERE id = connection_uuid AND enabled AND (visibility = 'public' OR owner_user_id = user_uuid OR EXISTS (SELECT 1 FROM users WHERE id = user_uuid AND role = 'admin' AND disabled_at IS NULL))
    FOR SHARE;
  IF NOT FOUND THEN RETURN -1; END IF;
  IF provider.visibility = 'private' THEN RETURN 0; END IF;

  INSERT INTO connection_quotas(connection_id, user_id, minute_start, day_start)
    VALUES (connection_uuid, user_uuid, current_minute, current_day) ON CONFLICT DO NOTHING;
  SELECT * INTO quota FROM connection_quotas
    WHERE connection_id = connection_uuid AND user_id = user_uuid FOR UPDATE;
  checked_at := clock_timestamp();
  current_day := (checked_at AT TIME ZONE 'UTC')::date;
  current_minute := date_trunc('minute', checked_at);
  IF quota.day_start <> current_day THEN quota.day_used := 0; END IF;
  IF quota.minute_start <> current_minute THEN quota.minute_used := 0; END IF;
  IF quota.day_used + amount > provider.requests_per_day THEN
    RETURN greatest(1, ceil(extract(epoch FROM ((current_day + 1)::timestamp AT TIME ZONE 'UTC') - checked_at))::integer);
  END IF;
  IF quota.minute_used + amount > provider.requests_per_minute THEN
    RETURN greatest(1, ceil(extract(epoch FROM current_minute + interval '1 minute' - checked_at))::integer);
  END IF;
  UPDATE connection_quotas SET minute_start = current_minute, day_start = current_day,
    minute_used = quota.minute_used + amount, day_used = quota.day_used + amount
    WHERE connection_id = connection_uuid AND user_id = user_uuid;
  RETURN 0;
END;
$$;
