const { prisma } = require('../config/database');
const { ApiError } = require('../middleware/errorHandler.middleware');

// @desc    Report a user (suspicious user)
// @route   POST /api/v1/reports
// @access  Private
const reportUser = async (req, res, next) => {
  try {
    const { reportedUserId, reason, description } = req.body;
    const reporterId = req.user.id;
    
    if (reportedUserId === reporterId) {
      return next(new ApiError(400, 'You cannot report yourself'));
    }
    
    const reportedUser = await prisma.user.findUnique({
      where: { id: reportedUserId, isActive: true }
    });
    
    if (!reportedUser) {
      return next(new ApiError(404, 'User not found'));
    }
    
    // Check if already reported by this user
    const existingReport = await prisma.report.findUnique({
      where: {
        reporterId_reportedUserId: {
          reporterId,
          reportedUserId
        }
      }
    });
    
    if (existingReport) {
      return next(new ApiError(400, 'You have already reported this user'));
    }
    
    const report = await prisma.report.create({
      data: {
        reporterId,
        reportedUserId,
        reason,
        description,
        status: 'PENDING'
      },
      include: {
        reporter: {
          select: {
            id: true,
            username: true,
            fullName: true
          }
        },
        reportedUser: {
          select: {
            id: true,
            username: true,
            fullName: true
          }
        }
      }
    });
    
    res.status(201).json({
      success: true,
      message: 'User reported successfully. Our team will review it.',
      data: report
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all reports (Admin only)
// @route   GET /api/v1/reports
// @access  Private/Admin
const getAllReports = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;
    
    const where = {};
    if (status) where.status = status;
    
    const reports = await prisma.report.findMany({
      where,
      include: {
        reporter: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatar: true
          }
        },
        reportedUser: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatar: true,
            email: true,
            isActive: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip: parseInt(skip),
      take: parseInt(limit)
    });
    
    const total = await prisma.report.count({ where });
    
    res.json({
      success: true,
      data: reports,
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

// @desc    Get my reports
// @route   GET /api/v1/reports/my
// @access  Private
const getMyReports = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;
    
    const reports = await prisma.report.findMany({
      where: { reporterId: userId },
      include: {
        reportedUser: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatar: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip: parseInt(skip),
      take: parseInt(limit)
    });
    
    res.json({
      success: true,
      data: reports,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update report status (Admin only)
// @route   PUT /api/v1/reports/:id/status
// @access  Private/Admin
const updateReportStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, actionTaken } = req.body;
    const adminId = req.user.id;
    
    const report = await prisma.report.findUnique({
      where: { id },
      include: { reportedUser: true }
    });
    
    if (!report) {
      return next(new ApiError(404, 'Report not found'));
    }
    
    const updatedReport = await prisma.report.update({
      where: { id },
      data: {
        status,
        resolvedBy: adminId,
        resolvedAt: status === 'RESOLVED' || status === 'DISMISSED' ? new Date() : null,
        actionTaken: actionTaken || null
      }
    });
    
    // If report is resolved and action taken is deactivate, deactivate user
    if (status === 'RESOLVED' && actionTaken === 'deactivated') {
      await prisma.user.update({
        where: { id: report.reportedUserId },
        data: {
          isActive: false,
          deactivatedAt: new Date()
        }
      });
      
      // Notify the reported user
      await prisma.notification.create({
        data: {
          userId: report.reportedUserId,
          type: 'ACCOUNT_DEACTIVATED',
          message: 'Your account has been deactivated due to violation of our terms.'
        }
      });
    }
    
    // Notify the reporter
    await prisma.notification.create({
      data: {
        userId: report.reporterId,
        type: 'REPORT_RESOLVED',
        message: `Your report against ${report.reportedUser.fullName} has been ${status.toLowerCase()}.`
      }
    });
    
    res.json({
      success: true,
      message: 'Report status updated successfully',
      data: updatedReport
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get report by ID (Admin only)
// @route   GET /api/v1/reports/:id
// @access  Private/Admin
const getReportById = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const report = await prisma.report.findUnique({
      where: { id },
      include: {
        reporter: {
          select: {
            id: true,
            username: true,
            fullName: true,
            email: true,
            avatar: true
          }
        },
        reportedUser: {
          select: {
            id: true,
            username: true,
            fullName: true,
            email: true,
            avatar: true,
            bio: true,
            postsCount: true,
            isActive: true,
            createdAt: true
          }
        }
      }
    });
    
    if (!report) {
      return next(new ApiError(404, 'Report not found'));
    }
    
    res.json({ success: true, data: report });
  } catch (error) {
    next(error);
  }
};

// @desc    Get report statistics (Admin only)
// @route   GET /api/v1/reports/stats/summary
// @access  Private/Admin
const getReportStats = async (req, res, next) => {
  try {
    const pending = await prisma.report.count({ where: { status: 'PENDING' } });
    const reviewed = await prisma.report.count({ where: { status: 'REVIEWED' } });
    const resolved = await prisma.report.count({ where: { status: 'RESOLVED' } });
    const dismissed = await prisma.report.count({ where: { status: 'DISMISSED' } });
    
    // Get reports by reason
    const reasons = await prisma.report.groupBy({
      by: ['reason'],
      _count: { reason: true }
    });
    
    res.json({
      success: true,
      data: {
        pending,
        reviewed,
        resolved,
        dismissed,
        total: pending + reviewed + resolved + dismissed,
        byReason: reasons.map(r => ({
          reason: r.reason,
          count: r._count.reason
        }))
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  reportUser,
  getAllReports,
  getMyReports,
  updateReportStatus,
  getReportById,
  getReportStats
};