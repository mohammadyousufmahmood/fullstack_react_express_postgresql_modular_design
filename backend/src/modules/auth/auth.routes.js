const express = require('express');
const createLoginRateLimiter = require('../../middleware/loginRateLimit');
const requireAuth = require('../../middleware/requireAuth');
const { csrf, login, logout, me } = require('./auth.controller');

function createAuthRoutes(options = {}) {
  const router = express.Router();
  const limitLogin = createLoginRateLimiter(options.loginRateLimit);

  router.get('/auth/csrf', csrf);
  router.post('/auth/login', limitLogin, login);
  router.post('/auth/logout', requireAuth, logout);
  router.get('/auth/me', requireAuth, me);

  return router;
}

module.exports = createAuthRoutes;
