const { createApp } = require('./app');
const { env } = require('./config/env');
const pool = require('./db/pool');
const logger = require('./lib/logger');

async function checkDatabase() {
  try {
    await pool.query('SELECT 1');
    logger.info('PostgreSQL connection ready', {
      host: env.db.host,
      port: env.db.port,
      database: env.db.name,
    });

    const schema = await pool.query(`
      SELECT to_regclass('public.users') AS users_table,
             to_regclass('public.sessions') AS sessions_table
    `);
    if (!schema.rows[0].users_table || !schema.rows[0].sessions_table) {
      logger.warn('Identity schema is not installed. Run npm run migrate.');
    }
  } catch (err) {
    logger.error('PostgreSQL is not ready. The process will keep running and /health will report database down.', {
      message: err.message,
    });
  }
}

function shutdown(server, signal) {
  logger.info('Shutting down', { signal });

  server.close((closeError) => {
    pool.end().then(
      () => process.exit(closeError ? 1 : 0),
      () => process.exit(1),
    );
  });

  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

function start() {
  const app = createApp();
  const server = app.listen(env.port, () => {
    logger.info('Server started', {
      port: env.port,
      nodeEnv: env.nodeEnv,
    });
    checkDatabase();
  });

  process.once('SIGINT', () => shutdown(server, 'SIGINT'));
  process.once('SIGTERM', () => shutdown(server, 'SIGTERM'));

  return server;
}

if (require.main === module) {
  start();
}

module.exports = { start };
