CREATE INDEX IF NOT EXISTS connections_owner_user_id_idx ON connections(owner_user_id);
CREATE INDEX IF NOT EXISTS connections_visibility_enabled_idx ON connections(visibility, enabled);
