const jwt = require('jsonwebtoken');
const { prisma } = require('../config/database');
const { ApiError } = require('./errorHandler.middleware');

// Protect routes - verify user is authenticated
const protect = async (req, res, next) => {
  let token;
  
  // Check for token in Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  
  // Check for token in cookies (optional)
  if (!token && req.cookies?.token) {
    token = req.cookies.token;
  }
  
  if (!token) {
    return next(new ApiError(401, 'Not authorized, no token provided'));
  }
  
  try {
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from database
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        username: true,
        fullName: true,
        avatar: true,
        bio: true,
        role: true,
        isActive: true,
        isVerified: true,
        createdAt: true
      }
    });
    
    if (!user) {
      return next(new ApiError(401, 'User not found'));
    }
    
    // Check if user is deactivated
    if (!user.isActive) {
      return next(new ApiError(401, 'Account deactivated. Please contact support.'));
    }
    
    // Attach user to request object
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return next(new ApiError(401, 'Invalid token'));
    }
    if (error.name === 'TokenExpiredError') {
      return next(new ApiError(401, 'Token expired'));
    }
    return next(new ApiError(401, 'Not authorized'));
  }
};

// Restrict access to specific roles
const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new ApiError(403, 'You do not have permission to perform this action'));
    }
    next();
  };
};

module.exports = { protect, restrictTo };