const { prisma } = require('../config/database');
const { ApiError } = require('../middleware/errorHandler.middleware');

// @desc    Get user analytics
// @route   GET /api/v1/analytics/user/:userId
// @access  Private
const getUserAnalytics = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { range = 'week' } = req.query;
    
    let dateFilter = {};
    const now = new Date();
    
    if (range === 'day') {
      dateFilter = {
        date: {
          gte: new Date(now.setHours(0, 0, 0, 0))
        }
      };
    } else if (range === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      dateFilter = { date: { gte: weekAgo } };
    } else if (range === 'month') {
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      dateFilter = { date: { gte: monthAgo } };
    }
    
    const analytics = await prisma.userAnalytics.findMany({
      where: {
        userId,
        ...dateFilter
      },
      orderBy: { date: 'asc' }
    });
    
    // Get user stats from User table
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        postsCount: true,
        followersCount: true,
        followingCount: true,
        totalLikesReceived: true,
        createdAt: true
      }
    });
    
    res.json({
      success: true,
      data: {
        summary: user,
        timeline: analytics,
        range
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get post analytics
// @route   GET /api/v1/analytics/post/:postId
// @access  Private (owner only)
const getPostAnalytics = async (req, res, next) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;
    
    const post = await prisma.post.findFirst({
      where: {
        id: postId,
        authorId: userId
      },
      include: {
        analytics: true,
        _count: {
          select: {
            likes: true,
            comments: true,
            shares: true
          }
        }
      }
    });
    
    if (!post) {
      return next(new ApiError(404, 'Post not found or not yours'));
    }
    
    const engagementRate = post._count.likes + post._count.comments + post._count.shares;
    const impressions = post.analytics?.impressions || 0;
    
    res.json({
      success: true,
      data: {
        postId: post.id,
        content: post.content,
        createdAt: post.createdAt,
        stats: {
          likes: post._count.likes,
          comments: post._count.comments,
          shares: post._count.shares,
          totalEngagement: engagementRate,
          impressions,
          engagementRate: impressions > 0 ? (engagementRate / impressions) * 100 : 0
        },
        analytics: post.analytics
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get platform analytics (Admin only)
// @route   GET /api/v1/analytics/platform
// @access  Private/Admin
const getPlatformAnalytics = async (req, res, next) => {
  try {
    const { range = 'week' } = req.query;
    
    let dateFilter = {};
    const now = new Date();
    
    if (range === 'day') {
      dateFilter = {
        date: {
          gte: new Date(now.setHours(0, 0, 0, 0))
        }
      };
    } else if (range === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      dateFilter = { date: { gte: weekAgo } };
    } else if (range === 'month') {
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      dateFilter = { date: { gte: monthAgo } };
    }
    
    // Get real-time counts
    const totalUsers = await prisma.user.count();
    const activeUsers = await prisma.user.count({ where: { isActive: true } });
    const totalPosts = await prisma.post.count({ where: { isDeleted: false } });
    const totalComments = await prisma.comment.count({ where: { isDeleted: false } });
    const totalMessages = await prisma.message.count();
    const pendingReports = await prisma.report.count({ where: { status: 'PENDING' } });
    
    // Get new users in range
    const newUsers = await prisma.user.count({
      where: {
        createdAt: dateFilter.date
      }
    });
    
    // Get new posts in range
    const newPosts = await prisma.post.count({
      where: {
        createdAt: dateFilter.date,
        isDeleted: false
      }
    });
    
    res.json({
      success: true,
      data: {
        summary: {
          totalUsers,
          activeUsers,
          totalPosts,
          totalComments,
          totalMessages,
          pendingReports,
          newUsers,
          newPosts
        },
        range
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Track post impression (view)
// @route   POST /api/v1/analytics/post/:postId/impression
// @access  Public
const trackImpression = async (req, res, next) => {
  try {
    const { postId } = req.params;
    
    await prisma.postAnalytics.upsert({
      where: { postId },
      update: {
        impressions: { increment: 1 }
      },
      create: {
        postId,
        impressions: 1,
        reach: 0
      }
    });
    
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

// @desc    Get trending posts
// @route   GET /api/v1/analytics/trending
// @access  Public
const getTrendingPosts = async (req, res, next) => {
  try {
    const { limit = 10 } = req.query;
    
    const posts = await prisma.post.findMany({
      where: {
        isDeleted: false,
        author: { isActive: true }
      },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatar: true
          }
        },
        media: true,
        analytics: true,
        _count: {
          select: {
            likes: true,
            comments: true,
            shares: true
          }
        }
      },
      orderBy: [
        { likesCount: 'desc' },
        { commentsCount: 'desc' },
        { createdAt: 'desc' }
      ],
      take: parseInt(limit)
    });
    
    // Calculate engagement score
    const postsWithScore = posts.map(post => ({
      ...post,
      engagementScore: (post._count.likes * 1) + (post._count.comments * 2) + (post._count.shares * 3)
    }));
    
    res.json({
      success: true,
      data: postsWithScore.sort((a, b) => b.engagementScore - a.engagementScore)
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUserAnalytics,
  getPostAnalytics,
  getPlatformAnalytics,
  trackImpression,
  getTrendingPosts
};