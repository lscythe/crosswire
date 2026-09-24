-- Run with psql -v ON_ERROR_STOP=1 against a migrated test database. Rolls back all data.
BEGIN;
DO $$
DECLARE
  caller uuid := gen_random_uuid();
  connection uuid := gen_random_uuid();
  retry integer;
BEGIN
  INSERT INTO users(id, username, email, password_hash, role) VALUES (caller, caller::text, caller::text || '@quota.invalid', 'test-only', 'member');
  INSERT INTO connections(id, owner_user_id, name, base_url, api_key_ciphertext, visibility, requests_per_minute, requests_per_day)
    VALUES (connection, caller, 'quota self-check', 'https://invalid.example/v1', 'test-only', 'public', 2, 3);
  ASSERT reserve_connection_requests(connection, caller, 2) = 0, 'two-request probe reservation';
  retry := reserve_connection_requests(connection, caller, 1);
  ASSERT retry BETWEEN 1 AND 60, 'minute limit';
  ASSERT (SELECT day_used FROM connection_quotas WHERE connection_id = connection) = 2, 'rejection must not consume quota';
  UPDATE connection_quotas SET minute_start = now() - interval '2 minutes' WHERE connection_id = connection;
  ASSERT reserve_connection_requests(connection, caller, 1) = 0, 'minute rollover';
  ASSERT reserve_connection_requests(connection, caller, 1) > 0, 'daily limit';
  UPDATE connection_quotas SET day_start = (now() AT TIME ZONE 'UTC')::date - 1, minute_start = now() - interval '1 day' WHERE connection_id = connection;
  ASSERT reserve_connection_requests(connection, caller, 2) = 0, 'UTC day rollover';
  ASSERT (SELECT day_used FROM connection_quotas WHERE connection_id = connection) = 2, 'day counter reset';
  UPDATE connections SET requests_per_minute = 1 WHERE id = connection;
  ASSERT reserve_connection_requests(connection, caller, 1) > 0, 'lowered limit applies immediately';
  UPDATE connections SET visibility = 'private' WHERE id = connection;
  ASSERT reserve_connection_requests(connection, caller, 2) = 0, 'private owner bypass';
  ASSERT reserve_connection_requests(connection, gen_random_uuid(), 1) = -1, 'private visibility enforced';
  UPDATE connections SET enabled = false WHERE id = connection;
  ASSERT reserve_connection_requests(connection, caller, 1) = -1, 'disabled connection rejected';
END;
$$;
ROLLBACK;
