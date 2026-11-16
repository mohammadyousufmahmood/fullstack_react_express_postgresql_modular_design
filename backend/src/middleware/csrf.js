const crypto = require('crypto');
const AppError = require('../errors/AppError');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function tokensMatch(expected, provided) {
  if (typeof expected !== 'string' || typeof provided !== 'string') {
    return false;
  }

  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

function requireCsrf(req, res, next) {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const provided = req.get('x-csrf-token');
  if (!tokensMatch(req.session?.csrfToken, provided)) {
    next(new AppError(403, 'CSRF_INVALID', 'CSRF token is missing or invalid'));
    return;
  }

  next();
}

module.exports = requireCsrf;
