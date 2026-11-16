const AppError = require('../../errors/AppError');

const WEAK_PASSWORDS = new Set([
  'password',
  'password123',
  'changeme',
  'change-me',
  'admin',
  'admin123',
  'letmein',
  'qwerty123456',
]);

function normalizeEmail(email) {
  if (typeof email !== 'string') {
    throw new AppError(400, 'VALIDATION_ERROR', 'A valid email is required');
  }

  const normalized = email.trim().toLowerCase();
  const looksValid = normalized.length >= 3
    && normalized.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);

  if (!looksValid) {
    throw new AppError(400, 'VALIDATION_ERROR', 'A valid email is required');
  }

  return normalized;
}

function validateLogin(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Email and password are required');
  }

  const email = normalizeEmail(body.email);
  if (typeof body.password !== 'string' || body.password.length === 0 || body.password.length > 200) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Email and password are required');
  }

  return { email, password: body.password };
}

function validateNewPassword(password, email) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 200) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Password must be 12 to 200 characters');
  }

  if (password.toLowerCase() === email || WEAK_PASSWORDS.has(password.toLowerCase())) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Choose a different password');
  }
}

module.exports = {
  normalizeEmail,
  validateLogin,
  validateNewPassword,
};
