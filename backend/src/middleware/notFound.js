const AppError = require('../errors/AppError');

function notFound(req, _res, next) {
  next(new AppError(404, 'NOT_FOUND', `Route not found: ${req.method} ${req.path}`));
}

module.exports = notFound;
