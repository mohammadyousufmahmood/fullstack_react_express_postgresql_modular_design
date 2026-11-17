const AppError = require('../errors/AppError');
const { env } = require('../config/env');

function createLoginRateLimiter(options = {}) {
  const max = options.max ?? env.loginRateLimitMax;
  const windowMs = options.windowMs ?? env.loginRateLimitWindowMs;
  const hits = new Map();

  return function loginRateLimiter(req, res, next) {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const key = `${req.ip}|${email}`;
    const now = Date.now();
    let entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }

    entry.count += 1;

    if (hits.size > 10_000) {
      for (const [storedKey, stored] of hits) {
        if (stored.resetAt <= now) {
          hits.delete(storedKey);
        }
      }
    }

    if (entry.count > max) {
      next(new AppError(429, 'TOO_MANY_REQUESTS', 'Too many login attempts. Try again later.'));
      return;
    }

    next();
  };
}

module.exports = createLoginRateLimiter;
