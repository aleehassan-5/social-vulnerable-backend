const { prisma } = require('../config/database');

// Aggregate user analytics for the previous day
const aggregateUserAnalytics = async () => {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get all users
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true }
    });
    
    for (const user of users) {
      // Get user's activity from yesterday
      const postsCreated = await prisma.post.count({
        where: {
          authorId: user.id,
          createdAt: { gte: yesterday, lt: today },
          isDeleted: false
        }
      });
      
      const commentsMade = await prisma.comment.count({
        where: {
          authorId: user.id,
          createdAt: { gte: yesterday, lt: today },
          isDeleted: false
        }
      });
      
      const likesGiven = await prisma.postLike.count({
        where: {
          userId: user.id,
          createdAt: { gte: yesterday, lt: today }
        }
      });
      
      const likesReceived = await prisma.postLike.count({
        where: {
          post: { authorId: user.id },
          createdAt: { gte: yesterday, lt: today }
        }
      });
      
      // Upsert analytics
      await prisma.userAnalytics.upsert({
        where: {
          userId_date: {
            userId: user.id,
            date: yesterday
          }
        },
        update: {
          postsCreated,
          commentsMade,
          likesGiven,
          likesReceived
        },
        create: {
          userId: user.id,
          date: yesterday,
          postsCreated,
          commentsMade,
          likesGiven,
          likesReceived
        }
      });
    }
    
    console.log(`✅ Analytics aggregated for ${yesterday.toDateString()}`);
  } catch (error) {
    console.error('❌ Analytics aggregation failed:', error);
  }
};

// Run daily at midnight
const scheduleAnalyticsJob = () => {
  const now = new Date();
  const night = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0, 0, 0
  );
  const msToMidnight = night.getTime() - now.getTime();
  
  setTimeout(() => {
    aggregateUserAnalytics();
    setInterval(aggregateUserAnalytics, 24 * 60 * 60 * 1000);
  }, msToMidnight);
  
  console.log('📊 Analytics job scheduled');
};

module.exports = { aggregateUserAnalytics, scheduleAnalyticsJob };