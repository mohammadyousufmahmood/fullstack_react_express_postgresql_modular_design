const AppError = require('../errors/AppError');
const { findActiveById } = require('../modules/users/user.repository');
const { destroySession } = require('../modules/auth/sessionState');
const { SESSION_COOKIE_NAME, clearSessionCookieOptions } = require('../session');

async function requireAuth(req, res, next) {
  try {
    if (!req.session?.userId) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
    }

    const user = await findActiveById(req.session.userId);
    if (!user) {
      await destroySession(req);
      res.clearCookie(SESSION_COOKIE_NAME, clearSessionCookieOptions());
      throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
    }

    req.user = { id: user.id, email: user.email };
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = requireAuth;
