const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const pool = require('./pool');
const { env } = require('../config/env');
const logger = require('../lib/logger');

const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');
const ADVISORY_LOCK_KEY = 714203;

function checksum(sql) {
  return crypto.createHash('sha256').update(sql).digest('hex');
}

function migrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Migrations directory not found: ${MIGRATIONS_DIR}`);
  }

  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function applyMigration(client, version, sql) {
  const digest = checksum(sql);
  const existing = await client.query(
    'SELECT checksum FROM schema_migrations WHERE version = $1',
    [version],
  );

  if (existing.rowCount > 0) {
    if (existing.rows[0].checksum !== digest) {
      throw new Error(
        `Migration ${version} changed after it was applied. Add a new migration file instead of editing it.`,
      );
    }
    return false;
  }

  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query(
      'INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)',
      [version, digest],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }

  return true;
}

async function runMigrations() {
  const client = await pool.connect();
  const applied = [];
  let locked = false;

  try {
    await client.query('SELECT pg_advisory_lock($1::bigint)', [ADVISORY_LOCK_KEY]);
    locked = true;
    await ensureMigrationsTable(client);

    for (const version of migrationFiles()) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, version), 'utf8');
      const didApply = await applyMigration(client, version, sql);
      if (didApply) {
        applied.push(version);
        logger.info('Migration applied', { version });
      }
    }
  } catch (err) {
    if (err.code === '42501') {
      throw new Error(
        `Database user "${env.db.user}" cannot create objects in schema public. As the database owner, run: GRANT CREATE ON SCHEMA public TO ${env.db.user};`,
      );
    }
    throw err;
  } finally {
    if (locked) {
      await client.query('SELECT pg_advisory_unlock($1::bigint)', [ADVISORY_LOCK_KEY]);
    }
    client.release();
  }

  return { applied };
}

async function closeAndExit(code) {
  await pool.end();
  process.exit(code);
}

if (require.main === module) {
  runMigrations()
    .then(() => closeAndExit(0))
    .catch((err) => {
      logger.error('Migration failed', { message: err.message });
      closeAndExit(1);
    });
}

module.exports = { runMigrations };
