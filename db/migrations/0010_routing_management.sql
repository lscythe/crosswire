-- Retain the newest default if older concurrent requests created duplicates.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY owner_user_id ORDER BY created_at DESC, id) AS position
  FROM routing_configs WHERE is_default
)
UPDATE routing_configs SET is_default = false WHERE id IN (SELECT id FROM ranked WHERE position > 1);
CREATE UNIQUE INDEX routing_configs_one_default ON routing_configs(owner_user_id) WHERE is_default;
ALTER TABLE request_logs ADD COLUMN attempts jsonb NOT NULL DEFAULT '[]'::jsonb;
