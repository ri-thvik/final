const Redis = require('ioredis');
const logger = require('../utils/logger');

let redis = null;

try {
  redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    retryStrategy: (times) => {
      // Stop retrying after 3 attempts
      if (times > 3) {
        logger.warn('Redis connection failed - running without cache');
        return null;
      }
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableOfflineQueue: false
  });

  redis.on('connect', () => {
    logger.info('Redis connected');
  });

  redis.on('error', (err) => {
    logger.warn('Redis not available - running without cache');
    redis = null;
  });
} catch (err) {
  logger.warn('Redis initialization failed - running without cache');
  redis = null;
}

module.exports = redis;
