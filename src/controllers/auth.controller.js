const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const { prisma } = require('../config/database');
const { ApiError } = require('../middleware/errorHandler.middleware');
const { uploadBase64ToCloudinary } = require('../utils/cloudinary');

// Upload a base64 avatar/cover image to Cloudinary
const saveBase64Image = async (base64String, userId, type) => {
  return uploadBase64ToCloudinary(base64String, `synergy/${type}s`, `${type}_${userId}`);
};

// Generate JWT Tokens
const generateTokens = (userId) => {
  const accessToken = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m'
  });
  
  const refreshToken = jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  });
  
  return { accessToken, refreshToken };
};

// @desc    Register User
// @route   POST /api/v1/auth/register
// @access  Public
const register = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, errors.array()[0].msg));
    }
    
    const { email, username, password, fullName } = req.body;
    
    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] }
    });
    
    if (existingUser) {
      return next(new ApiError(400, 'Email or username already taken'));
    }
    
    const hashedPassword = await bcrypt.hash(password, 12);
    
    const user = await prisma.user.create({
      data: {
        email,
        username,
        passwordHash: hashedPassword,
        fullName,
      },
      select: {
        id: true,
        email: true,
        username: true,
        fullName: true,
        avatar: true,
        coverImage: true,
        bio: true,
        role: true,
        isVerified: true,
        createdAt: true
      }
    });
    
    const { accessToken, refreshToken } = generateTokens(user.id);
    
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken }
    });

    res.cookie('token', accessToken, {
      httpOnly: false,
      sameSite: 'none',
      secure: true,
      maxAge: 15 * 60 * 1000,
    });
    
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: { user, accessToken, refreshToken }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Login User
// @route   POST /api/v1/auth/login
// @access  Public
const login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, errors.array()[0].msg));
    }
    
    const { email, password } = req.body;
    
    const user = await prisma.user.findUnique({
      where: { email }
    });
    
    if (!user) {
      return next(new ApiError(401, 'Invalid credentials'));
    }
    
    if (!user.isActive) {
      return next(new ApiError(401, 'Account deactivated. Please contact support.'));
    }
    
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return next(new ApiError(401, 'Invalid credentials'));
    }
    
    const { accessToken, refreshToken } = generateTokens(user.id);
    
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken }
    });

    // Also set the access token as a cookie so the app "stays logged in"
    // across tabs without re-entering credentials.
    res.cookie('token', accessToken, {
      httpOnly: false,
      sameSite: 'none',
      secure: true,
      maxAge: 15 * 60 * 1000,
    });
    
    const userData = {
      id: user.id,
      email: user.email,
      username: user.username,
      fullName: user.fullName,
      avatar: user.avatar,
      coverImage: user.coverImage,
      bio: user.bio,
      role: user.role,
      isVerified: user.isVerified,
      createdAt: user.createdAt
    };
    
    res.json({
      success: true,
      message: 'Login successful',
      data: { user: userData, accessToken, refreshToken }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Logout User
// @route   POST /api/v1/auth/logout
// @access  Private
const logout = async (req, res, next) => {
  try {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { refreshToken: null }
    });
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Refresh Token
// @route   POST /api/v1/auth/refresh-token
// @access  Public
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return next(new ApiError(401, 'Refresh token required'));
    }
    
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    
    const user = await prisma.user.findFirst({
      where: {
        id: decoded.id,
        refreshToken: refreshToken
      }
    });
    
    if (!user) {
      return next(new ApiError(401, 'Invalid refresh token'));
    }
    
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user.id);
    
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: newRefreshToken }
    });
    
    res.json({
      success: true,
      data: { accessToken, refreshToken: newRefreshToken }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get Current User
// @route   GET /api/v1/auth/me
// @access  Private
const getMe = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        username: true,
        fullName: true,
        avatar: true,
        coverImage: true,
        bio: true,
        role: true,
        isVerified: true,
        createdAt: true,
        postsCount: true,
        followersCount: true,
        followingCount: true
      }
    });
    
    res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update Profile (with avatar and cover image support)
// @route   PUT /api/v1/auth/profile
// @access  Private
const updateProfile = async (req, res, next) => {
  try {
    const { fullName, bio, username, avatar, coverImage, ...rest } = req.body;
    const userId = req.user.id;
    
    console.log('📝 Updating profile for user:', userId);
    console.log('  - fullName:', fullName);
    console.log('  - bio:', bio);
    console.log('  - username:', username);
    console.log('  - avatar received:', avatar ? 'Yes (base64)' : 'No');
    console.log('  - coverImage received:', coverImage ? 'Yes (base64)' : 'No');
    
    let updatedAvatar = undefined;
    let updatedCover = undefined;
    
    // Handle avatar upload (base64)
    if (avatar && avatar.startsWith('data:')) {
      updatedAvatar = await saveBase64Image(avatar, userId, 'avatar');
      console.log('  - Avatar saved to:', updatedAvatar);
    } else if (avatar === null) {
      updatedAvatar = null;
    } else if (avatar && !avatar.startsWith('data:')) {
      // Already a URL, keep as is
      updatedAvatar = avatar;
    }
    
    // Handle cover image upload (base64)
    if (coverImage && coverImage.startsWith('data:')) {
      updatedCover = await saveBase64Image(coverImage, userId, 'cover');
      console.log('  - Cover saved to:', updatedCover);
    } else if (coverImage === null) {
      updatedCover = null;
    } else if (coverImage && !coverImage.startsWith('data:')) {
      // Already a URL, keep as is
      updatedCover = coverImage;
    }
    
    // Check if username is taken
    if (username && username !== req.user.username) {
      const existingUser = await prisma.user.findUnique({
        where: { username }
      });
      if (existingUser) {
        return next(new ApiError(400, 'Username already taken'));
      }
    }
    
    const updateData = { ...rest };
    if (fullName !== undefined) updateData.fullName = fullName;
    if (bio !== undefined) updateData.bio = bio;
    if (username !== undefined) updateData.username = username;
    if (updatedAvatar !== undefined) updateData.avatar = updatedAvatar;
    if (updatedCover !== undefined) updateData.coverImage = updatedCover;
    
    console.log('  - Updating fields:', Object.keys(updateData));
    
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        username: true,
        fullName: true,
        avatar: true,
        coverImage: true,
        bio: true,
        role: true,
        isVerified: true,
        createdAt: true
      }
    });
    
    console.log('✅ Profile updated successfully');
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: { user: updatedUser }
    });
  } catch (error) {
    console.error('❌ Update profile error:', error);
    next(error);
  }
};

// @desc    Change Password
// @route   PUT /api/v1/auth/change-password
// @access  Private
const changePassword = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError(400, errors.array()[0].msg));
    }
    
    const { currentPassword, newPassword } = req.body;
    
    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });
    
    const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isPasswordValid) {
      return next(new ApiError(401, 'Current password is incorrect'));
    }
    
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash: hashedPassword }
    });
    
    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  logout,
  refreshToken,
  getMe,
  updateProfile,
  changePassword
};