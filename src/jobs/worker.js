const { scheduleAnalyticsJob } = require('./analytics.job');
const { scheduleCleanupJob } = require('./cleanup.job');

console.log('🚀 Starting background job worker...');

// Schedule all background jobs
const startAllJobs = () => {
  try {
    // Schedule analytics aggregation (daily)
    scheduleAnalyticsJob();
    console.log('✅ Analytics job scheduled');
    
    // Schedule cleanup job (weekly)
    scheduleCleanupJob();
    console.log('✅ Cleanup job scheduled');
    
    console.log('🎉 All background jobs are running');
  } catch (error) {
    console.error('❌ Failed to start jobs:', error);
  }
};

// Start jobs
startAllJobs();

// Keep process running
process.on('SIGTERM', () => {
  console.log('Worker shutting down...');
  process.exit(0);
});