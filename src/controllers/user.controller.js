const { prisma } = require('../config/database');
const { ApiError } = require('../middleware/errorHandler.middleware');

// @desc    Get user profile by username
// @route   GET /api/v1/users/:username
// @access  Public
const getUserProfile = async (req, res, next) => {
  try {
    const { username } = req.params;
    
    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        fullName: true,
        avatar: true,
        bio: true,
        coverImage: true,
        isVerified: true,
        postsCount: true,
        followersCount: true,
        followingCount: true,
        createdAt: true
      }
    });
    
    if (!user) {
      return next(new ApiError(404, 'User not found'));
    }
    
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

// @desc    Search users by username/name
// @route   GET /api/v1/users/search?q=
// @access  Private
//
// VULN (SQL Injection): built with raw string concatenation and executed via
// $queryRawUnsafe instead of Prisma's normal parameterized query builder (or
// even $queryRaw with a tagged template, which auto-escapes). A value like
//   ' OR '1'='1
// or a UNION SELECT breaks out of the intended WHERE clause and can pull
// data — including passwordHash/refreshToken/email — from the User table
// (or any other table) regardless of what the search box was meant to
// return, since results are returned as-is with no field allow-list.
// FIX: use the query builder Prisma already offers elsewhere in this file
// (see getUserProfile above) — e.g.
//   prisma.user.findMany({ where: { OR: [
//     { username: { contains: q, mode: 'insensitive' } },
//     { fullName: { contains: q, mode: 'insensitive' } },
//   ]}, select: { id: true, username: true, fullName: true, avatar: true, bio: true } })
// or, if a raw query is truly needed, prisma.$queryRaw`...${q}...` (tagged
// template — parameterized) instead of $queryRawUnsafe with concatenation.
const searchUsers = async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ success: true, data: [] });

    const sql = `
      SELECT id, username, "fullName", avatar, bio, "isVerified"
      FROM "User"
      WHERE "isActive" = true
        AND (username ILIKE '%${q}%' OR "fullName" ILIKE '%${q}%')
      LIMIT 20
    `;

    const rows = await prisma.$queryRawUnsafe(sql);
    res.json({ success: true, data: rows });
  } catch (error) {
    // Leaking the raw DB error message is itself a smaller info-disclosure
    // bug, left in intentionally alongside the injection above.
    res.status(400).json({ success: false, message: 'Search failed', error: error.message });
  }
};

// @desc    Follow a user
// @route   POST /api/v1/users/:id/follow
// @access  Private
const followUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const followerId = req.user.id;
    
    if (id === followerId) {
      return next(new ApiError(400, 'You cannot follow yourself'));
    }
    
    const userToFollow = await prisma.user.findUnique({
      where: { id }
    });
    
    if (!userToFollow) {
      return next(new ApiError(404, 'User not found'));
    }
    
    const existingFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId,
          followingId: id
        }
      }
    });
    
    if (existingFollow) {
      return next(new ApiError(400, 'Already following this user'));
    }
    
    await prisma.follow.create({
      data: {
        followerId,
        followingId: id
      }
    });
    
    await prisma.user.update({
      where: { id: followerId },
      data: { followingCount: { increment: 1 } }
    });
    
    await prisma.user.update({
      where: { id },
      data: { followersCount: { increment: 1 } }
    });
    
    res.json({ success: true, message: 'User followed successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Unfollow a user
// @route   DELETE /api/v1/users/:id/follow
// @access  Private
const unfollowUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const followerId = req.user.id;
    
    const follow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId,
          followingId: id
        }
      }
    });
    
    if (!follow) {
      return next(new ApiError(400, 'Not following this user'));
    }
    
    await prisma.follow.delete({
      where: {
        followerId_followingId: {
          followerId,
          followingId: id
        }
      }
    });
    
    await prisma.user.update({
      where: { id: followerId },
      data: { followingCount: { decrement: 1 } }
    });
    
    await prisma.user.update({
      where: { id },
      data: { followersCount: { decrement: 1 } }
    });
    
    res.json({ success: true, message: 'User unfollowed successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user's followers
// @route   GET /api/v1/users/:id/followers
// @access  Public
const getFollowers = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const followers = await prisma.follow.findMany({
      where: { followingId: id },
      include: {
        follower: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatar: true
          }
        }
      }
    });
    
    res.json({ 
      success: true, 
      data: followers.map(f => f.follower)
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user's following
// @route   GET /api/v1/users/:id/following
// @access  Public
const getFollowing = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const following = await prisma.follow.findMany({
      where: { followerId: id },
      include: {
        following: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatar: true
          }
        }
      }
    });
    
    res.json({ 
      success: true, 
      data: following.map(f => f.following)
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update current user profile
// @route   PUT /api/v1/users/me
// @access  Private
const updateProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { fullName, bio, location, website } = req.body;

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(fullName  !== undefined && { fullName }),
        ...(bio       !== undefined && { bio }),
        ...(location  !== undefined && { location }),
        ...(website   !== undefined && { website }),
      },
      select: {
        id: true,
        username: true,
        fullName: true,
        bio: true,
        location: true,
        website: true,
        avatar: true,
        isVerified: true,
        postsCount: true,
        followersCount: true,
        followingCount: true,
      }
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUserProfile,
  updateProfile,
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  searchUsers
};