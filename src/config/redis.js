// Redis is OPTIONAL — app works without it (queues/caching disabled)
let redisInstance = null;

async function connectRedis() {
  if (!process.env.REDIS_URL && !process.env.REDIS_HOST) {
    console.log('⚠️  Redis not configured — running without cache/queues (OK for basic use)');
    return;
  }

  try {
    const Redis = require('ioredis');

    const config = process.env.REDIS_URL
      ? process.env.REDIS_URL
      : {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD || undefined,
          retryStrategy: (times) => {
            if (times > 3) return null;
            return Math.min(times * 200, 2000);
          },
          enableOfflineQueue: false,
        };

    redisInstance = new Redis(config);

    redisInstance.on('connect', () => console.log('✅ Redis connected'));
    redisInstance.on('error', (err) => {
      console.error('❌ Redis error (non-fatal):', err.message);
    });

    await redisInstance.ping();
    console.log('✅ Redis is ready');
  } catch (error) {
    console.error('⚠️  Redis unavailable (non-fatal) — continuing without it:', error.message);
    redisInstance = null;
  }
}

// Use getter so other files always get current value
const redis = new Proxy({}, {
  get(_, prop) {
    if (prop === 'then') return undefined; // not a promise
    if (!redisInstance) return () => Promise.resolve(null);
    return typeof redisInstance[prop] === 'function'
      ? redisInstance[prop].bind(redisInstance)
      : redisInstance[prop];
  }
});

module.exports = { redis, connectRedis };
