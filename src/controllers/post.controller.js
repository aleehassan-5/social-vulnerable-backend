const { prisma } = require('../config/database');
const { ApiError } = require('../middleware/errorHandler.middleware');
const { uploadBase64ToCloudinary } = require('../utils/cloudinary');

const saveBase64Media = async (base64String, postId) => {
  const isVideo = base64String.includes('data:video');
  return uploadBase64ToCloudinary(base64String, 'synergy/posts', `post_${postId}`);
};

const transformPost = (post, isLiked = false) => {
  return {
    id: post.id,
    content: post.content,
    postType: post.postType,
    media: post.media || [],
    author: {
      id: post.author.id,
      username: post.author.username,
      fullName: post.author.fullName,
      avatar: post.author.avatar || null
    },
    _count: {
      likes: post._count?.likes || 0,
      comments: post._count?.comments || 0,
      shares: post._count?.shares || 0
    },
    isLiked: isLiked,
    createdAt: post.createdAt
  };
};

const createPost = async (req, res, next) => {
  try {
    const { content, postType, visibility, mediaUrl, mediaType } = req.body;
    const authorId = req.user.id;

    if ((!content || content.trim() === '') && !mediaUrl) {
      return next(new ApiError(400, 'Post content or media is required'));
    }

    let determinedPostType = 'TEXT';
    
    if (mediaUrl) {
      if (mediaType === 'VIDEO') {
        determinedPostType = 'VIDEO';
      } else if (mediaType === 'IMAGE') {
        determinedPostType = 'PHOTO';
      }
    } else if (postType) {
      const typeMap = {
        'TEXT': 'TEXT',
        'IMAGE': 'PHOTO',
        'PHOTO': 'PHOTO',
        'VIDEO': 'VIDEO',
      };
      determinedPostType = typeMap[postType.toUpperCase()] || 'TEXT';
    }
    
    const post = await prisma.post.create({
      data: {
        content: (content && content.trim()) ? content.trim() : '',
        postType: determinedPostType,
        visibility: visibility || 'PUBLIC',
        authorId: authorId,
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
        _count: { select: { likes: true, comments: true, shares: true } }
      }
    });
    
    if (mediaUrl && mediaUrl.startsWith('data:')) {
      const savedMediaUrl = await saveBase64Media(mediaUrl, post.id);
      
      if (savedMediaUrl) {
        await prisma.postMedia.create({
          data: {
            postId: post.id,
            mediaUrl: savedMediaUrl,
            mediaType: mediaType === 'VIDEO' ? 'VIDEO' : 'IMAGE',
            order: 0
          }
        });
      }
    } else if (mediaUrl) {
      await prisma.postMedia.create({
        data: {
          postId: post.id,
          mediaUrl: mediaUrl,
          mediaType: mediaType === 'VIDEO' ? 'VIDEO' : 'IMAGE',
          order: 0
        }
      });
    }

    const updatedPost = await prisma.post.findUnique({
      where: { id: post.id },
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
        _count: { select: { likes: true, comments: true, shares: true } }
      }
    });

    await prisma.user.update({
      where: { id: authorId },
      data: { postsCount: { increment: 1 } }
    });

    const transformedPost = transformPost(updatedPost, false);

    res.status(201).json({
      success: true,
      data: transformedPost
    });
  } catch (error) {
    console.error('Create post error:', error);
    next(error);
  }
};

const getFeed = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 15 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const following = await prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true }
    });

    const followingIds = following.map(f => f.followingId);
    followingIds.push(userId);

    const whereClause = followingIds.length > 1
      ? { authorId: { in: followingIds }, isDeleted: false, author: { isActive: true } }
      : { isDeleted: false, visibility: 'PUBLIC', author: { isActive: true } };

    const posts = await prisma.post.findMany({
      where: whereClause,
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
        _count: { select: { likes: true, comments: true, shares: true } }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: parseInt(limit)
    });

    const postsWithStatus = await Promise.all(posts.map(async (post) => {
      const liked = await prisma.postLike.findUnique({
        where: { userId_postId: { userId, postId: post.id } }
      });
      return transformPost(post, !!liked);
    }));

    res.json({
      success: true,
      data: postsWithStatus,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: postsWithStatus.length === parseInt(limit)
      }
    });
  } catch (error) {
    next(error);
  }
};

const getPost = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const post = await prisma.post.findFirst({
      where: { id, isDeleted: false, author: { isActive: true } },
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
        _count: { select: { likes: true, comments: true, shares: true } }
      }
    });

    if (!post) return next(new ApiError(404, 'Post not found'));

    let isLiked = false;
    if (userId) {
      const likeRecord = await prisma.postLike.findUnique({
        where: { userId_postId: { userId, postId: post.id } }
      });
      isLiked = !!likeRecord;
    }

    const transformedPost = transformPost(post, isLiked);

    res.json({ success: true, data: transformedPost });
  } catch (error) {
    next(error);
  }
};

// ✅ ADD THIS NEW FUNCTION - Update post (preserve media)
const updatePost = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    // Find the post and check ownership
    const post = await prisma.post.findFirst({
      where: { 
        id, 
        authorId: userId, 
        isDeleted: false 
      },
      include: {
        media: true
      }
    });

    if (!post) {
      return next(new ApiError(404, 'Post not found or you are not the author'));
    }

    // Update only the content, preserve media
    const updatedPost = await prisma.post.update({
      where: { id },
      data: { 
        content: content.trim() 
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
        _count: { select: { likes: true, comments: true, shares: true } }
      }
    });

    // Check if user liked the post
    let isLiked = false;
    const likeRecord = await prisma.postLike.findUnique({
      where: { userId_postId: { userId, postId: id } }
    });
    isLiked = !!likeRecord;

    const transformedPost = transformPost(updatedPost, isLiked);

    res.json({
      success: true,
      data: transformedPost
    });
  } catch (error) {
    console.error('Update post error:', error);
    next(error);
  }
};

const deletePost = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const post = await prisma.post.findFirst({
      where: { id, authorId: userId, isDeleted: false },
      include: { media: true }
    });

    if (!post) return next(new ApiError(404, 'Post not found'));

    // Media now lives on Cloudinary, so there's no local file to clean up here.
    // (Cloudinary assets can be pruned separately if needed.)

    await prisma.post.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() }
    });

    await prisma.user.update({
      where: { id: userId },
      data: { postsCount: { decrement: 1 } }
    });

    res.json({ success: true, message: 'Post deleted successfully' });
  } catch (error) {
    next(error);
  }
};

const getExplore = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 15 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const posts = await prisma.post.findMany({
      where: {
        isDeleted: false,
        visibility: 'PUBLIC',
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
        _count: { select: { likes: true, comments: true, shares: true } }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: parseInt(limit)
    });

    const postsWithStatus = await Promise.all(posts.map(async (post) => {
      const liked = await prisma.postLike.findUnique({
        where: { userId_postId: { userId, postId: post.id } }
      });
      return transformPost(post, !!liked);
    }));

    res.json({
      success: true,
      data: postsWithStatus,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: postsWithStatus.length === parseInt(limit)
      }
    });
  } catch (error) {
    next(error);
  }
};

const toggleLike = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const post = await prisma.post.findFirst({
      where: { id, isDeleted: false }
    });

    if (!post) return next(new ApiError(404, 'Post not found'));

    const existingLike = await prisma.postLike.findUnique({
      where: { userId_postId: { userId, postId: id } }
    });

    let liked;
    if (existingLike) {
      await prisma.postLike.delete({
        where: { userId_postId: { userId, postId: id } }
      });
      liked = false;
    } else {
      await prisma.postLike.create({
        data: { userId, postId: id }
      });
      liked = true;
    }

    const likeCount = await prisma.postLike.count({
      where: { postId: id }
    });

    res.json({
      success: true,
      data: { liked, likes: likeCount }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Fetch a link preview (title/image) for a URL pasted into the
//          post composer — e.g. pasting a news link auto-shows a card.
// @route   POST /api/v1/posts/link-preview   { url }
// @access  Private
const linkPreview = async (req, res, next) => {
  try {
    const { url } = req.body || {};
    if (!url || typeof url !== 'string') {
      return next(new ApiError(400, 'url is required'));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    const body = (await response.text()).slice(0, 4000);

    res.json({
      success: true,
      data: {
        url,
        status: response.status,
        contentType: response.headers.get('content-type') || null,
        preview: body,
      },
    });
  } catch (error) {
    next(new ApiError(400, `Could not fetch link preview: ${error.message}`));
  }
};

module.exports = {
  createPost,
  getFeed,
  getPost,
  updatePost,  // ✅ ADD THIS
  deletePost,
  getExplore,
  toggleLike,
  linkPreview
};