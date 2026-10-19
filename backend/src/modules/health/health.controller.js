const pool = require('../../db/pool');
const logger = require('../../lib/logger');

async function getHealth(_req, res) {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({
      status: 'ok',
      database: 'up',
    });
  } catch (err) {
    logger.error('Database health check failed', { message: err.message });
    res.status(503).json({
      status: 'error',
      database: 'down',
    });
  }
}

module.exports = { getHealth };
