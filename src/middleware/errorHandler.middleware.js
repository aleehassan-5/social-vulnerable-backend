// Custom API Error class
class ApiError extends Error {
  constructor(statusCode, message, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Global error handler middleware
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message    = err.message    || 'Internal Server Error';

  // Prisma error handling
  if (err.code === 'P2002') {
    statusCode = 409;
    message = 'A record with this data already exists';
  } else if (err.code === 'P2025') {
    statusCode = 404;
    message = 'Record not found';
  } else if (err.code === 'P2003') {
    statusCode = 400;
    message = 'Invalid reference: related record not found';
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401; message = 'Invalid token';
  }
  if (err.name === 'TokenExpiredError') {
    statusCode = 401; message = 'Token expired';
  }

  // Log non-operational errors (bugs) more verbosely
  if (!err.isOperational || statusCode === 500) {
    console.error(`[ERROR] ${statusCode}: ${message}`);
    if (process.env.NODE_ENV === 'development') console.error(err.stack);
  }

  res.status(statusCode).json({
    success: false,
    message,
    statusCode,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

// 404 Not Found handler
const notFound = (req, res, next) => {
  next(new ApiError(404, `Route not found: ${req.originalUrl}`));
};

module.exports = { ApiError, errorHandler, notFound };
