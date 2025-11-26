/**
 * Token Manager - Handles storing and retrieving OAuth tokens
 * In production, you should use a proper database instead of JSON files
 */

const fs = require('fs');
const path = require('path');

const TOKEN_FILE = path.join(__dirname, 'tokens.json');

/**
 * Load tokens from file
 * @returns {Object} Tokens object with userId, accessToken, refreshToken, expiresAt
 */
function loadTokens() {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const data = fs.readFileSync(TOKEN_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading tokens:', error);
  }
  return {};
}

/**
 * Save tokens to file
 * @param {string} userId - eBay user ID
 * @param {string} accessToken - OAuth access token
 * @param {string} refreshToken - OAuth refresh token
 * @param {number} expiresIn - Token expiration time in seconds
 */
function saveTokens(userId, accessToken, refreshToken, expiresIn) {
  try {
    const tokens = loadTokens();
    const expiresAt = Date.now() + (expiresIn * 1000);
    
    tokens[userId] = {
      accessToken,
      refreshToken,
      expiresAt,
      userId
    };
    
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
    console.log(`Tokens saved for user: ${userId}`);
  } catch (error) {
    console.error('Error saving tokens:', error);
    throw error;
  }
}

/**
 * Get tokens for a specific user
 * @param {string} userId - eBay user ID
 * @returns {Object|null} Token object or null if not found
 */
function getTokens(userId) {
  const tokens = loadTokens();
  return tokens[userId] || null;
}

/**
 * Check if access token is expired
 * @param {string} userId - eBay user ID
 * @returns {boolean} True if expired or missing
 */
function isTokenExpired(userId) {
  const tokens = getTokens(userId);
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
function updateAccessToken(userId, accessToken, expiresIn) {
  const tokens = loadTokens();
  if (tokens[userId]) {
    tokens[userId].accessToken = accessToken;
    tokens[userId].expiresAt = Date.now() + (expiresIn * 1000);
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
  }
}

module.exports = {
  loadTokens,
  saveTokens,
  getTokens,
  isTokenExpired,
  updateAccessToken
};

