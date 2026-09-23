#!/usr/bin/env bash
set -euo pipefail
# Run against the local Compose stack; fixture and key are deleted afterward.
docker compose --env-file .env.example -f infra/compose/docker-compose.yml exec -T -w /app/apps/web web node <<'JS'
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { Pool } = require('pg');
(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const id = randomUUID();
  const key = `cw_live_${randomBytes(32).toString('hex')}`;
  try {
    await pool.query("INSERT INTO users(id,email,password_hash,role,must_change_password) VALUES ($1,$2,'unusable','member',true)", [id, `gateway-check-${id}@example.com`]);
    await pool.query("INSERT INTO api_keys(user_id,name,key_hash,key_prefix) VALUES ($1,'access check',$2,$3)", [id, createHash('sha256').update(key).digest(), key.slice(0, 16)]);
    const request = () => fetch('http://gateway:8080/v1/models', { headers: { Authorization: `Bearer ${key}` } });
    assert.equal((await request()).status, 401, 'restricted user must be rejected');
    await pool.query('UPDATE users SET must_change_password = false WHERE id = $1', [id]);
    assert.equal((await request()).status, 200, 'unrestricted user must be admitted');
    await pool.query('UPDATE users SET disabled_at = now() WHERE id = $1', [id]);
    assert.equal((await request()).status, 401, 'disabled user must be rejected');
    console.log('gateway password restriction passed');
  } finally {
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    await pool.end();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
JS
