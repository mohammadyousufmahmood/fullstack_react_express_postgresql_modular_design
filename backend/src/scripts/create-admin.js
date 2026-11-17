const pool = require('../db/pool');
const logger = require('../lib/logger');
const AppError = require('../errors/AppError');
const { createAccount } = require('../modules/auth/auth.service');

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    logger.error('Set ADMIN_EMAIL and ADMIN_PASSWORD for this command only. Do not store the password in .env or source control.');
    process.exitCode = 1;
    return;
  }

  try {
    const user = await createAccount({ email, password, roleName: 'admin' });
    logger.info('Administrator created', { email: user.email });
  } catch (err) {
    if (err instanceof AppError) {
      logger.error(err.message, { code: err.code });
    } else {
      logger.error('Could not create administrator', { message: err.message });
    }
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().finally(() => pool.end());
}

module.exports = { main };
