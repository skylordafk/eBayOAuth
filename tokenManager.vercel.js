/**
 * Token Manager for Vercel KV (Redis) Storage
 * 
 * This replaces the file-based tokenManager.js for serverless deployment.
 * Uses Vercel KV for persistent token storage across function invocations.
 */

const { kv } = require('@vercel/kv');

const TOKEN_PREFIX = 'ebay_token:';

/**
 * Load all tokens from KV store
 * @returns {Promise<Object>} All tokens object
 */
async function loadTokens() {
  try {
    const keys = await kv.keys(`${TOKEN_PREFIX}*`);
    if (keys.length === 0) return {};
    
    const tokens = {};
    for (const key of keys) {
      const userId = key.replace(TOKEN_PREFIX, '');
      const data = await kv.get(key);
      if (data) {
        tokens[userId] = data;
      }
    }
    return tokens;
  } catch (error) {
    console.error('Error loading tokens from KV:', error);
    return {};
  }
}

/**
 * Save tokens to KV store
 * @param {string} userId - eBay user ID
 * @param {string} accessToken - OAuth access token
 * @param {string} refreshToken - OAuth refresh token
 * @param {number} expiresIn - Token expiration time in seconds
 */
async function saveTokens(userId, accessToken, refreshToken, expiresIn) {
  try {
    const expiresAt = Date.now() + (expiresIn * 1000);
    const tokenData = {
      accessToken,
      refreshToken,
      expiresAt,
      userId
    };
    
    await kv.set(`${TOKEN_PREFIX}${userId}`, tokenData);
    console.log(`Tokens saved for user: ${userId}`);
  } catch (error) {
    console.error('Error saving tokens to KV:', error);
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
    const data = await kv.get(`${TOKEN_PREFIX}${userId}`);
    return data || null;
  } catch (error) {
    console.error('Error getting tokens from KV:', error);
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
    const tokens = await getTokens(userId);
    if (tokens) {
      tokens.accessToken = accessToken;
      tokens.expiresAt = Date.now() + (expiresIn * 1000);
      await kv.set(`${TOKEN_PREFIX}${userId}`, tokens);
    }
  } catch (error) {
    console.error('Error updating access token in KV:', error);
    throw error;
  }
}

/**
 * Delete tokens for a specific user
 * @param {string} userId - eBay user ID
 */
async function deleteTokens(userId) {
  try {
    await kv.del(`${TOKEN_PREFIX}${userId}`);
    console.log(`Tokens deleted for user: ${userId}`);
  } catch (error) {
    console.error('Error deleting tokens from KV:', error);
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

