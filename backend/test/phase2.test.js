const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const pool = require('../src/db/pool');
const { runMigrations } = require('../src/db/migrate');

const migrationSql = fs.readFileSync(
  path.resolve(__dirname, '../migrations/001_identity_and_sessions.sql'),
  'utf8',
);

test.after(async () => {
  await pool.end();
});

test('identity migration installs reference data and no default account', async () => {
  const first = await runMigrations();
  const second = await runMigrations();

  assert.deepEqual(second.applied, []);
  assert.ok(
    first.applied.length === 0 || first.applied.includes('001_identity_and_sessions.sql'),
  );
  assert.equal(/insert\s+into\s+users/i.test(migrationSql), false);

  const tables = await pool.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = ANY($1::text[])
     ORDER BY table_name`,
    [[
      'users',
      'roles',
      'permissions',
      'user_roles',
      'role_permissions',
      'sessions',
      'schema_migrations',
    ]],
  );
  assert.deepEqual(tables.rows.map((row) => row.table_name), [
    'permissions',
    'role_permissions',
    'roles',
    'schema_migrations',
    'sessions',
    'user_roles',
    'users',
  ]);

  const grants = await pool.query(
    `SELECT roles.name, permissions.name AS permission
     FROM roles
     JOIN role_permissions ON role_permissions.role_id = roles.id
     JOIN permissions ON permissions.id = role_permissions.permission_id
     ORDER BY roles.name, permissions.name`,
  );
  assert.deepEqual(grants.rows, [
    { name: 'admin', permission: 'records.create' },
    { name: 'admin', permission: 'records.delete' },
    { name: 'admin', permission: 'records.read' },
    { name: 'admin', permission: 'records.update' },
    { name: 'admin', permission: 'users.manage' },
    { name: 'member', permission: 'records.create' },
    { name: 'member', permission: 'records.delete' },
    { name: 'member', permission: 'records.read' },
    { name: 'member', permission: 'records.update' },
  ]);

  const sessionColumns = await pool.query(
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'sessions'
     ORDER BY column_name`,
  );
  assert.deepEqual(sessionColumns.rows, [
    { column_name: 'expire', data_type: 'timestamp without time zone' },
    { column_name: 'sess', data_type: 'json' },
    { column_name: 'sid', data_type: 'character varying' },
  ]);

  const trigger = await pool.query(
    `SELECT 1
     FROM pg_trigger
     WHERE tgname = 'users_set_updated_at' AND NOT tgisinternal`,
  );
  assert.equal(trigger.rowCount, 1);
});

test('database constraints protect accounts, assignments, and sessions', async () => {
  await runMigrations();

  await expectSqlState(async (client) => {
    await client.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2)',
      ['NotLower@example.com', 'hash'],
    );
  }, '23514');

  await expectSqlState(async (client) => {
    await client.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2)',
      ['phase2-dup@example.com', 'hash'],
    );
    await client.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2)',
      ['phase2-dup@example.com', 'hash'],
    );
  }, '23505');

  await expectSqlState(async (client) => {
    await client.query("DELETE FROM permissions WHERE name = 'users.manage'");
  }, '23001');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO users (email, password_hash)
       VALUES ('phase2-cascade@example.com', 'not-a-real-hash')
       RETURNING id`,
    );
    await client.query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, id FROM roles WHERE name = 'member'`,
      [inserted.rows[0].id],
    );
    await client.query('DELETE FROM users WHERE id = $1', [inserted.rows[0].id]);
    const remaining = await client.query(
      'SELECT count(*)::int AS count FROM user_roles WHERE user_id = $1',
      [inserted.rows[0].id],
    );
    assert.equal(remaining.rows[0].count, 0);

    await client.query(
      `INSERT INTO sessions (sid, sess, expire)
       VALUES ('phase2-sid', '{"cookie":{}}'::json, to_timestamp($1))`,
      [Math.ceil(Date.now() / 1000) + 60],
    );
    const stored = await client.query(
      'SELECT sess FROM sessions WHERE sid = $1',
      ['phase2-sid'],
    );
    assert.deepEqual(stored.rows[0].sess, { cookie: {} });
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }

  const leftovers = await pool.query(
    `SELECT
       (SELECT count(*)::int FROM users WHERE email LIKE 'phase2-%') AS users,
       (SELECT count(*)::int FROM sessions WHERE sid = 'phase2-sid') AS sessions`,
  );
  assert.deepEqual(leftovers.rows[0], { users: 0, sessions: 0 });
});

async function expectSqlState(fn, sqlState) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await fn(client);
    throw new Error(`Expected SQLSTATE ${sqlState}`);
  } catch (err) {
    if (err.code !== sqlState) {
      throw err;
    }
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}
