const { validateLogin } = require('./auth.validation');
const { authenticate } = require('./auth.service');
const { regenerateSession, destroySession, issueCsrfToken } = require('./sessionState');
const { SESSION_COOKIE_NAME, clearSessionCookieOptions } = require('../../session');

function csrf(req, res) {
  if (typeof req.session.csrfToken !== 'string') {
    issueCsrfToken(req);
  }

  res.status(200).json({ csrfToken: req.session.csrfToken });
}

async function login(req, res) {
  const { email, password } = validateLogin(req.body);
  const user = await authenticate(email, password);

  await regenerateSession(req);
  req.session.userId = user.id;
  const csrfToken = issueCsrfToken(req);

  res.status(200).json({ user, csrfToken });
}

async function logout(req, res) {
  await destroySession(req);
  res.clearCookie(SESSION_COOKIE_NAME, clearSessionCookieOptions());
  res.status(204).end();
}

function me(req, res) {
  res.status(200).json({ user: req.user });
}

module.exports = {
  csrf,
  login,
  logout,
  me,
};
