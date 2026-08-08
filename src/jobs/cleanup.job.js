const { prisma } = require('../config/database');

// Permanently delete items soft-deleted more than 30 days ago
const cleanupSoftDeleted = async () => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Get soft-deleted posts older than 30 days
    const oldPosts = await prisma.post.findMany({
      where: {
        isDeleted: true,
        deletedAt: { lt: thirtyDaysAgo }
      },
      select: { id: true }
    });
    
    // Get soft-deleted comments older than 30 days
    const oldComments = await prisma.comment.findMany({
      where: {
        isDeleted: true,
        deletedAt: { lt: thirtyDaysAgo }
      },
      select: { id: true }
    });
    
    // Get deactivated users older than 30 days
    const oldUsers = await prisma.user.findMany({
      where: {
        isActive: false,
        deactivatedAt: { lt: thirtyDaysAgo },
        role: 'USER'
      },
      select: { id: true }
    });
    
    // Hard delete old posts
    if (oldPosts.length > 0) {
      await prisma.post.deleteMany({
        where: {
          id: { in: oldPosts.map(p => p.id) }
        }
      });
      console.log(`🧹 Deleted ${oldPosts.length} old posts permanently`);
    }
    
    // Hard delete old comments
    if (oldComments.length > 0) {
      await prisma.comment.deleteMany({
        where: {
          id: { in: oldComments.map(c => c.id) }
        }
      });
      console.log(`🧹 Deleted ${oldComments.length} old comments permanently`);
    }
    
    // Hard delete old deactivated users (optional - be careful!)
    // if (oldUsers.length > 0) {
    //   await prisma.user.deleteMany({
    //     where: {
    //       id: { in: oldUsers.map(u => u.id) }
    //     }
    //   });
    //   console.log(`🧹 Deleted ${oldUsers.length} old deactivated users permanently`);
    // }
    
    console.log(`✅ Cleanup completed at ${new Date().toISOString()}`);
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
  }
};

// Run cleanup weekly
const scheduleCleanupJob = () => {
  // Run every Sunday at 2 AM
  const scheduleCleanup = () => {
    const now = new Date();
    const nextSunday = new Date();
    nextSunday.setDate(now.getDate() + (7 - now.getDay()));
    nextSunday.setHours(2, 0, 0, 0);
    
    const msUntilNext = nextSunday.getTime() - now.getTime();
    
    setTimeout(() => {
      cleanupSoftDeleted();
      setInterval(cleanupSoftDeleted, 7 * 24 * 60 * 60 * 1000);
    }, msUntilNext);
  };
  
  scheduleCleanup();
  console.log('🧹 Cleanup job scheduled (weekly)');
};

module.exports = { cleanupSoftDeleted, scheduleCleanupJob };