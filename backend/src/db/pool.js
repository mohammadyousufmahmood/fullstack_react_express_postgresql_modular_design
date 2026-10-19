const { Pool } = require('pg');
const { env } = require('../config/env');
const logger = require('../lib/logger');

const pool = new Pool({
  host: env.db.host,
  port: env.db.port,
  database: env.db.name,
  user: env.db.user,
  password: env.db.password,
  max: env.db.poolMax,
  application_name: 'auth_exp',
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 2_000,
});

pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error', {
    message: err.message,
  });
});

module.exports = pool;
