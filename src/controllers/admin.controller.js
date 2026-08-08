const { prisma } = require('../config/database');
const { ApiError } = require('../middleware/errorHandler.middleware');

// @desc    Get all users (Admin only)
// @route   GET /api/v1/admin/users
// @access  Private/Admin
const getAllUsers = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, role, isActive, search } = req.query;
    const skip = (page - 1) * limit;
    
    const where = {};
    if (role) where.role = role;
    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (search) {
      where.OR = [
        { username: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { fullName: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        username: true,
        fullName: true,
        avatar: true,
        role: true,
        isActive: true,
        isVerified: true,
        postsCount: true,
        followersCount: true,
        followingCount: true,
        createdAt: true,
        deactivatedAt: true
      },
      orderBy: { createdAt: 'desc' },
      skip: parseInt(skip),
      take: parseInt(limit)
    });
    
    const total = await prisma.user.count({ where });
    
    res.json({
      success: true,
      data: users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single user (Admin only)
// @route   GET /api/v1/admin/users/:id
// @access  Private/Admin
const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        posts: {
          where: { isDeleted: false },
          take: 10,
          orderBy: { createdAt: 'desc' }
        },
        reportsReceived: {
          where: { status: 'PENDING' },
          take: 5
        },
        reportsSent: {
          take: 5,
          orderBy: { createdAt: 'desc' }
        }
      }
    });
    
    if (!user) {
      return next(new ApiError(404, 'User not found'));
    }
    
    // Remove sensitive data
    const { passwordHash, refreshToken, ...safeUser } = user;
    
    res.json({ success: true, data: safeUser });
  } catch (error) {
    next(error);
  }
};

// @desc    Update user role (Admin only)
// @route   PUT /api/v1/admin/users/:id/role
// @access  Private/Admin
const updateUserRole = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    
    if (!['USER', 'MODERATOR', 'ADMIN'].includes(role)) {
      return next(new ApiError(400, 'Invalid role'));
    }
    
    const user = await prisma.user.update({
      where: { id },
      data: { role },
      select: {
        id: true,
        username: true,
        fullName: true,
        email: true,
        role: true
      }
    });
    
    res.json({
      success: true,
      message: `User role updated to ${role}`,
      data: user
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Deactivate user (Admin only)
// @route   PUT /api/v1/admin/users/:id/deactivate
// @access  Private/Admin
const deactivateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user.id;
    
    const user = await prisma.user.findUnique({ where: { id } });
    
    if (!user) {
      return next(new ApiError(404, 'User not found'));
    }
    
    if (user.role === 'ADMIN') {
      return next(new ApiError(403, 'Cannot deactivate another admin'));
    }
    
    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        isActive: false,
        deactivatedAt: new Date()
      }
    });
    
    // Create notification for deactivated user
    await prisma.notification.create({
      data: {
        userId: id,
        type: 'ACCOUNT_DEACTIVATED',
        message: reason || 'Your account has been deactivated by an administrator.'
      }
    });
    
    res.json({
      success: true,
      message: 'User deactivated successfully',
      data: { id: updatedUser.id, isActive: updatedUser.isActive }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Reactivate user (Admin only)
// @route   PUT /api/v1/admin/users/:id/reactivate
// @access  Private/Admin
const reactivateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const user = await prisma.user.findUnique({ where: { id } });
    
    if (!user) {
      return next(new ApiError(404, 'User not found'));
    }
    
    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        isActive: true,
        deactivatedAt: null
      }
    });
    
    await prisma.notification.create({
      data: {
        userId: id,
        type: 'SYSTEM_ALERT',
        message: 'Your account has been reactivated.'
      }
    });
    
    res.json({
      success: true,
      message: 'User reactivated successfully',
      data: { id: updatedUser.id, isActive: updatedUser.isActive }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete user (soft delete - Admin only)
// @route   DELETE /api/v1/admin/users/:id
// @access  Private/Admin
const deleteUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const user = await prisma.user.findUnique({ where: { id } });
    
    if (!user) {
      return next(new ApiError(404, 'User not found'));
    }
    
    if (user.role === 'ADMIN') {
      return next(new ApiError(403, 'Cannot delete another admin'));
    }
    
    // Soft delete user
    await prisma.user.update({
      where: { id },
      data: {
        isActive: false,
        deactivatedAt: new Date()
      }
    });
    
    // Soft delete all user posts
    await prisma.post.updateMany({
      where: { authorId: id },
      data: {
        isDeleted: true,
        deletedAt: new Date()
      }
    });
    
    res.json({
      success: true,
      message: 'User and all associated content deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get dashboard stats (Admin only)
// @route   GET /api/v1/admin/dashboard
// @access  Private/Admin
const getDashboardStats = async (req, res, next) => {
  try {
    const [
      totalUsers,
      activeUsers,
      totalPosts,
      totalComments,
      totalMessages,
      pendingReports,
      todayUsers,
      todayPosts
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.post.count({ where: { isDeleted: false } }),
      prisma.comment.count({ where: { isDeleted: false } }),
      prisma.message.count(),
      prisma.report.count({ where: { status: 'PENDING' } }),
      prisma.user.count({
        where: {
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) }
        }
      }),
      prisma.post.count({
        where: {
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
          isDeleted: false
        }
      })
    ]);
    
    res.json({
      success: true,
      data: {
        users: {
          total: totalUsers,
          active: activeUsers,
          inactive: totalUsers - activeUsers,
          newToday: todayUsers
        },
        content: {
          posts: totalPosts,
          comments: totalComments,
          messages: totalMessages,
          postsToday: todayPosts
        },
        reports: {
          pending: pendingReports
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  updateUserRole,
  deactivateUser,
  reactivateUser,
  deleteUser,
  getDashboardStats
};