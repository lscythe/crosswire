ALTER TABLE users ADD COLUMN username citext UNIQUE;
DO $$
DECLARE
  account record;
  base_name text;
  candidate text;
  suffix integer;
BEGIN
  FOR account IN SELECT id, email FROM users ORDER BY (role = 'admin') DESC, created_at, id LOOP
    base_name := left(regexp_replace(lower(split_part(account.email::text, '@', 1)), '[^a-z0-9._-]', '', 'g'), 64);
    IF base_name !~ '^[a-z0-9][a-z0-9._-]{2,63}$' THEN base_name := 'user_' || replace(account.id::text, '-', ''); END IF;
    candidate := base_name;
    suffix := 0;
    WHILE EXISTS (SELECT 1 FROM users WHERE username = candidate) LOOP
      suffix := suffix + 1;
      candidate := left(base_name, 50) || '_' || suffix::text;
    END LOOP;
    UPDATE users SET username = candidate WHERE id = account.id;
  END LOOP;
END;
$$;
ALTER TABLE users ALTER COLUMN username SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT username_format CHECK (username::text ~ '^[a-z0-9][a-z0-9._-]{2,63}$');
