const crypto = require('crypto');

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

function destroySession(req) {
  return new Promise((resolve, reject) => {
    if (!req.session) {
      resolve();
      return;
    }
    req.session.destroy((err) => (err ? reject(err) : resolve()));
  });
}

function issueCsrfToken(req) {
  const token = crypto.randomBytes(32).toString('base64url');
  req.session.csrfToken = token;
  return token;
}

module.exports = {
  regenerateSession,
  destroySession,
  issueCsrfToken,
};
