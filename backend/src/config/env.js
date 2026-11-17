const path = require('path');
const dotenv = require('dotenv');

dotenv.config({
  path: path.resolve(__dirname, '../../.env'),
  quiet: true,
});

function required(name) {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function integer(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be an integer`);
  }
  return value;
}

function booleanValue(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

const nodeEnv = process.env.NODE_ENV || 'development';
const port = integer('PORT', 3000);
const sessionSecret = required('SESSION_SECRET');
const sessionMaxAgeMs = integer('SESSION_MAX_AGE_MS', 8 * 60 * 60 * 1000);
const loginRateLimitMax = integer('LOGIN_RATE_LIMIT_MAX', 10);
const loginRateLimitWindowMs = integer('LOGIN_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000);

if (port < 0 || port > 65535) {
  throw new Error('PORT must be between 0 and 65535');
}

if (sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET must be at least 32 characters');
}

if (nodeEnv === 'production' && sessionSecret === 'replace-with-at-least-32-random-characters') {
  throw new Error('Replace SESSION_SECRET before running in production');
}

if (sessionMaxAgeMs < 60_000 || sessionMaxAgeMs > 30 * 24 * 60 * 60 * 1000) {
  throw new Error('SESSION_MAX_AGE_MS must be between 1 minute and 30 days');
}

if (loginRateLimitMax < 1 || loginRateLimitWindowMs < 1_000) {
  throw new Error('Login rate limit settings are too small');
}

const env = Object.freeze({
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port,
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  trustProxy: booleanValue('TRUST_PROXY', false),
  sessionSecret,
  sessionMaxAgeMs,
  sessionPruneIntervalSeconds: process.env.NODE_TEST_CONTEXT ? false : 15 * 60,
  loginRateLimitMax,
  loginRateLimitWindowMs,
  db: Object.freeze({
    host: required('DB_HOST'),
    port: integer('DB_PORT', 5432),
    name: required('DB_NAME'),
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
    poolMax: integer('DB_POOL_MAX', 10),
  }),
});

module.exports = { env };
