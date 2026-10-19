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

const nodeEnv = process.env.NODE_ENV || 'development';
const port = integer('PORT', 3000);

if (port < 0 || port > 65535) {
  throw new Error('PORT must be between 0 and 65535');
}

const env = Object.freeze({
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port,
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
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
