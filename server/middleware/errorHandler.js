/**
 * middleware/errorHandler.js
 * Глобальный обработчик ошибок Express.
 */

// eslint-disable-next-line no-unused-vars
module.exports = (err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Внутренняя ошибка сервера',
  });
};
