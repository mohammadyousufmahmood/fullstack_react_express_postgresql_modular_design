const express = require('express');
const cors = require('cors');
const { env } = require('./config/env');
const healthRoutes = require('./modules/health/health.routes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

function createApp() {
  const app = express();

  app.disable('x-powered-by');

  app.use(cors({
    origin: env.clientOrigin,
    credentials: true,
  }));

  app.use(express.json({ limit: '100kb' }));

  app.use(healthRoutes);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
