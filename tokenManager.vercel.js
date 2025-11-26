/**
 * Token Manager for Redis Storage (Vercel Serverless)
 * 
 * This replaces the file-based tokenManager.js for serverless deployment.
 * Uses ioredis for persistent token storage across function invocations.
 */

const Redis = require('ioredis');

// Initialize Redis client using REDIS_URL from Vercel
// The URL format: redis://default:password@host:port
let redis = null;

function getRedis() {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable is not set');
    }
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      lazyConnect: true,
    });
  }
  return redis;
}

const TOKEN_PREFIX = 'ebay_token:';

/**
 * Load all tokens from Redis
 * @returns {Promise<Object>} All tokens object
 */
async function loadTokens() {
  try {
    const client = getRedis();
    await client.connect().catch(() => {}); // Ignore if already connected
    
    const keys = await client.keys(`${TOKEN_PREFIX}*`);
    if (!keys || keys.length === 0) return {};
    
    const tokens = {};
    for (const key of keys) {
      const userId = key.replace(TOKEN_PREFIX, '');
      const data = await client.get(key);
      if (data) {
        tokens[userId] = JSON.parse(data);
      }
    }
    return tokens;
  } catch (error) {
    console.error('Error loading tokens from Redis:', error.message);
    return {};
  }
}

/**
 * Save tokens to Redis
 * @param {string} userId - eBay user ID
 * @param {string} accessToken - OAuth access token
 * @param {string} refreshToken - OAuth refresh token
 * @param {number} expiresIn - Token expiration time in seconds
 */
async function saveTokens(userId, accessToken, refreshToken, expiresIn) {
  try {
    const client = getRedis();
    await client.connect().catch(() => {});
    
    const expiresAt = Date.now() + (expiresIn * 1000);
    const tokenData = {
      accessToken,
      refreshToken,
      expiresAt,
      userId
    };
    
    await client.set(`${TOKEN_PREFIX}${userId}`, JSON.stringify(tokenData));
    console.log(`Tokens saved for user: ${userId}`);
  } catch (error) {
    console.error('Error saving tokens to Redis:', error.message);
    throw error;
  }
}

/**
 * Get tokens for a specific user
 * @param {string} userId - eBay user ID
 * @returns {Promise<Object|null>} Token object or null if not found
 */
async function getTokens(userId) {
  try {
    const client = getRedis();
    await client.connect().catch(() => {});
    
    const data = await client.get(`${TOKEN_PREFIX}${userId}`);
    if (!data) return null;
    return JSON.parse(data);
  } catch (error) {
    console.error('Error getting tokens from Redis:', error.message);
    return null;
  }
}

/**
 * Check if access token is expired
 * @param {string} userId - eBay user ID
 * @returns {Promise<boolean>} True if expired or missing
 */
async function isTokenExpired(userId) {
  const tokens = await getTokens(userId);
  if (!tokens || !tokens.expiresAt) {
    return true;
  }
  // Refresh if token expires in less than 5 minutes
  return Date.now() >= (tokens.expiresAt - 5 * 60 * 1000);
}

/**
 * Update access token for a user
 * @param {string} userId - eBay user ID
 * @param {string} accessToken - New access token
 * @param {number} expiresIn - Token expiration time in seconds
 */
async function updateAccessToken(userId, accessToken, expiresIn) {
  try {
    const client = getRedis();
    await client.connect().catch(() => {});
    
    const tokens = await getTokens(userId);
    if (tokens) {
      tokens.accessToken = accessToken;
      tokens.expiresAt = Date.now() + (expiresIn * 1000);
      await client.set(`${TOKEN_PREFIX}${userId}`, JSON.stringify(tokens));
    }
  } catch (error) {
    console.error('Error updating access token in Redis:', error.message);
    throw error;
  }
}

/**
 * Delete tokens for a specific user
 * @param {string} userId - eBay user ID
 */
async function deleteTokens(userId) {
  try {
    const client = getRedis();
    await client.connect().catch(() => {});
    
    await client.del(`${TOKEN_PREFIX}${userId}`);
    console.log(`Tokens deleted for user: ${userId}`);
  } catch (error) {
    console.error('Error deleting tokens from Redis:', error.message);
    throw error;
  }
}

module.exports = {
  loadTokens,
  saveTokens,
  getTokens,
  isTokenExpired,
  updateAccessToken,
  deleteTokens
};
