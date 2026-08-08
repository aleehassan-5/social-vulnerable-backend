/**
 * Async handler to avoid try-catch blocks in controllers
 * Wraps async route handlers and passes errors to error middleware
 * 
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Express middleware function
 */

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;