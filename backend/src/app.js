const express = require('express');
const cors = require('cors');
const { env } = require('./config/env');
const { createSessionMiddleware } = require('./session');
const requireCsrf = require('./middleware/csrf');
const healthRoutes = require('./modules/health/health.routes');
const createAuthRoutes = require('./modules/auth/auth.routes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

function createApp(options = {}) {
  const app = express();

  app.disable('x-powered-by');
  if (env.trustProxy) {
    app.set('trust proxy', 1);
  }

  app.use(cors({
    origin: env.clientOrigin,
    credentials: true,
  }));

  app.use(express.json({ limit: '100kb' }));

  const { middleware, store } = createSessionMiddleware();
  app.locals.sessionStore = store;
  app.use(middleware);
  app.use(requireCsrf);

  app.use(healthRoutes);
  app.use(createAuthRoutes(options));
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
