const pool = require('../../db/pool');
const AppError = require('../../errors/AppError');
const { findByEmail, insertUser, assignRole } = require('../users/user.repository');
const { hashPassword, passwordMatches } = require('./password');
const { normalizeEmail, validateNewPassword } = require('./auth.validation');

function invalidCredentials() {
  return new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
}

async function authenticate(email, password) {
  const user = await findByEmail(email);
  const matches = await passwordMatches(user?.password_hash, password);

  if (!user || !matches || !user.is_active) {
    throw invalidCredentials();
  }

  return { id: user.id, email: user.email };
}

async function createAccount({ email, password, roleName }) {
  const normalizedEmail = normalizeEmail(email);
  validateNewPassword(password, normalizedEmail);
  const passwordHash = await hashPassword(password);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const user = await insertUser(client, normalizedEmail, passwordHash);
    const assigned = await assignRole(client, user.id, roleName);
    if (!assigned) {
      throw new AppError(500, 'ROLE_NOT_FOUND', 'The requested role is not configured');
    }
    await client.query('COMMIT');
    return { id: user.id, email: user.email };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      throw new AppError(409, 'EMAIL_TAKEN', 'An account with that email already exists');
    }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  authenticate,
  createAccount,
};
