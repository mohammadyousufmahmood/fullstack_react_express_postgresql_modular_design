const AppError = require('../errors/AppError');
const logger = require('../lib/logger');

function isJsonParseError(err) {
  return err.type === 'entity.parse.failed' || (err instanceof SyntaxError && err.status === 400);
}

function errorHandler(err, _req, res, next) {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (isJsonParseError(err)) {
    res.status(400).json({
      error: {
        code: 'INVALID_JSON',
        message: 'Request body must be valid JSON',
      },
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
      },
    });
    return;
  }

  logger.error('Unhandled error', {
    name: err.name,
    message: err.message,
    stack: err.stack,
  });

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    },
  });
}

module.exports = errorHandler;
