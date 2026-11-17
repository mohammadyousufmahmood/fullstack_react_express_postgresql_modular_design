const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const pool = require('./db/pool');
const { env } = require('./config/env');
const logger = require('./lib/logger');

const SESSION_COOKIE_NAME = 'sid';

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: env.sessionMaxAgeMs,
  };
}

function clearSessionCookieOptions() {
  const { maxAge, ...options } = sessionCookieOptions();
  return options;
}

function createSessionMiddleware() {
  const store = new PgSession({
    pool,
    tableName: 'sessions',
    createTableIfMissing: false,
    pruneSessionInterval: env.sessionPruneIntervalSeconds,
    errorLog: (...parts) => {
      logger.error('Session store error', {
        message: parts.map((part) => (part instanceof Error ? part.message : String(part))).join(' '),
      });
    },
  });

  const middleware = session({
    store,
    name: SESSION_COOKIE_NAME,
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: sessionCookieOptions(),
  });

  return { middleware, store };
}

module.exports = {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  clearSessionCookieOptions,
  createSessionMiddleware,
};
