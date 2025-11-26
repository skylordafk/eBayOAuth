/**
 * eBay OAuth Server - Vercel Serverless Entry Point
 * 
 * SECURE TOKEN COLLECTION PORTAL
 * - Public: OAuth flow (login/callback) - shows success/failure only
 * - Protected: Token access requires API_SECRET header
 * 
 * Flow:
 * 1. User visits /auth/login → redirected to eBay
 * 2. User authorizes → eBay redirects to /auth/callback with code
 * 3. Server exchanges code for tokens → stores securely
 * 4. User sees success/failure message (no token details)
 * 5. Backend systems use API_SECRET to retrieve tokens
 */

const express = require('express');
const EbayAuthToken = require('ebay-oauth-nodejs-client');

// Use Redis-based token manager for persistent storage
const tokenManager = require('../tokenManager.vercel');

const app = express();

// Configuration
const ENVIRONMENT = (process.env.EBAY_ENVIRONMENT || 'PRODUCTION').toUpperCase();
const API_SECRET = process.env.API_SECRET;
const SCOPES = process.env.EBAY_SCOPES 
  ? process.env.EBAY_SCOPES.split(/[,\s]+/).filter(s => s.length > 0)
  : ['https://api.ebay.com/oauth/api_scope'];

// Initialize eBay OAuth client
const ebayAuthToken = new EbayAuthToken({
  env: ENVIRONMENT,
  clientId: process.env.EBAY_CLIENT_ID,
  clientSecret: process.env.EBAY_CLIENT_SECRET,
  redirectUri: process.env.EBAY_REDIRECT_URI
});

app.use(express.json());

/**
 * Middleware: Require API_SECRET for protected routes
 */
function requireApiSecret(req, res, next) {
  const providedSecret = req.headers['x-api-secret'] || req.query.secret;
  
  if (!API_SECRET) {
    return res.status(500).json({ 
      error: 'API_SECRET not configured on server',
      hint: 'Set API_SECRET environment variable in Vercel'
    });
  }
  
  if (!providedSecret) {
    return res.status(401).json({ 
      error: 'Authentication required',
      hint: 'Provide API secret via X-API-Secret header or ?secret= query param'
    });
  }
  
  if (providedSecret !== API_SECRET) {
    return res.status(403).json({ error: 'Invalid API secret' });
  }
  
  next();
}

/**
 * Fetch eBay username using access token
 */
async function getEbayUsername(accessToken) {
  const apiUrl = ENVIRONMENT === 'PRODUCTION'
    ? 'https://apiz.ebay.com/commerce/identity/v1/user/'
    : 'https://apiz.sandbox.ebay.com/commerce/identity/v1/user/';
  
  const response = await fetch(apiUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get user info: ${error}`);
  }
  
  const data = await response.json();
  return data.username;
}

/**
 * Common page styles
 */
const pageStyles = `
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    max-width: 700px;
    margin: 0 auto;
    padding: 40px 20px;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    min-height: 100vh;
    color: #e8e8e8;
  }
  h1 {
    color: #fff;
    font-size: 2.5rem;
    margin-bottom: 0.5rem;
  }
  .subtitle {
    color: #8892b0;
    margin-bottom: 2rem;
  }
  .login-btn {
    display: inline-block;
    background: linear-gradient(135deg, #e5383b 0%, #ba181b 100%);
    color: white;
    padding: 14px 28px;
    text-decoration: none;
    border-radius: 8px;
    font-weight: 600;
    font-size: 1.1rem;
    transition: transform 0.2s, box-shadow 0.2s;
    box-shadow: 0 4px 15px rgba(229, 56, 59, 0.3);
  }
  .login-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(229, 56, 59, 0.4);
  }
  .info-box {
    margin-top: 2rem;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 12px;
    padding: 20px;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }
  .info-box h3 { margin-top: 0; color: #8892b0; }
  .info-box p { color: #a8b2c1; line-height: 1.6; }
  .success-icon { font-size: 4rem; margin-bottom: 1rem; }
  .error-icon { font-size: 4rem; margin-bottom: 1rem; }
  .center { text-align: center; }
  .success-title { color: #64ffda; }
  .error-title { color: #e5383b; }
  .user-badge {
    display: inline-block;
    background: rgba(100, 255, 218, 0.1);
    color: #64ffda;
    padding: 8px 16px;
    border-radius: 20px;
    font-weight: 500;
    margin: 1rem 0;
  }
  .home-link {
    display: inline-block;
    margin-top: 2rem;
    color: #8892b0;
    text-decoration: none;
  }
  .home-link:hover { color: #64ffda; }
  .security-note {
    margin-top: 2rem;
    padding: 15px;
    background: rgba(100, 255, 218, 0.05);
    border-left: 3px solid #64ffda;
    border-radius: 0 8px 8px 0;
  }
  .security-note p { margin: 0; color: #8892b0; font-size: 0.9rem; }
`;

// ============================================
// PUBLIC ROUTES - No authentication required
// ============================================

// Home page - simple authorization portal
app.get('/', async (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>eBay OAuth Portal</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>${pageStyles}</style>
    </head>
    <body>
      <h1>🛒 eBay OAuth Portal</h1>
      <p class="subtitle">Secure OAuth 2.0 authorization for eBay API access</p>
      
      <a href="/auth/login" class="login-btn">🔐 Authorize eBay Account</a>
      
      <div class="info-box">
        <h3>How it works</h3>
        <p>
          Click the button above to securely connect your eBay account. 
          You'll be redirected to eBay to sign in and grant permissions.
          Once complete, you'll see a confirmation message.
        </p>
      </div>
      
      <div class="security-note">
        <p>🔒 <strong>Security:</strong> Your credentials are encrypted and stored securely. 
        Token access is restricted to authorized backend systems only.</p>
      </div>
    </body>
    </html>
  `);
});

// Start OAuth flow
app.get('/auth/login', (req, res) => {
  try {
    const authUrl = ebayAuthToken.generateUserAuthorizationUrl(ENVIRONMENT, SCOPES);
    console.log('🔗 Auth URL:', authUrl);
    res.redirect(authUrl);
  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Error - eBay OAuth</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>${pageStyles}</style>
      </head>
      <body class="center">
        <div class="error-icon">❌</div>
        <h1 class="error-title">Configuration Error</h1>
        <p style="color: #8892b0;">Unable to start OAuth flow. Please contact support.</p>
        <a href="/" class="home-link">← Back to Home</a>
      </body>
      </html>
    `);
  }
});

// OAuth callback - receives authorization code from eBay
app.get('/auth/callback', async (req, res) => {
  const { code, error } = req.query;
  
  console.log('\n📥 Callback received');
  
  // Handle eBay error response
  if (error) {
    console.error('❌ Error from eBay:', error);
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authorization Denied - eBay OAuth</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>${pageStyles}</style>
      </head>
      <body class="center">
        <div class="error-icon">🚫</div>
        <h1 class="error-title">Authorization Denied</h1>
        <p style="color: #8892b0;">You declined to authorize access to your eBay account.</p>
        <p style="color: #666; font-size: 0.9rem;">If this was a mistake, you can try again.</p>
        <a href="/auth/login" class="login-btn" style="margin-top: 1.5rem;">Try Again</a>
        <br>
        <a href="/" class="home-link">← Back to Home</a>
      </body>
      </html>
    `);
  }
  
  // No authorization code received
  if (!code) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Error - eBay OAuth</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>${pageStyles}</style>
      </head>
      <body class="center">
        <div class="error-icon">⚠️</div>
        <h1 class="error-title">Missing Authorization Code</h1>
        <p style="color: #8892b0;">No authorization code was received from eBay.</p>
        <a href="/auth/login" class="login-btn" style="margin-top: 1.5rem;">Try Again</a>
        <br>
        <a href="/" class="home-link">← Back to Home</a>
      </body>
      </html>
    `);
  }
  
  try {
    console.log('🔄 Exchanging code for tokens...');
    const response = await ebayAuthToken.exchangeCodeForAccessToken(ENVIRONMENT, code);
    const tokenData = typeof response === 'string' ? JSON.parse(response) : response;
    
    const { access_token, refresh_token, expires_in } = tokenData;
    
    if (!access_token || !refresh_token) {
      throw new Error('Invalid token response from eBay');
    }
    
    // Fetch the eBay username
    console.log('🔍 Fetching eBay username...');
    let username;
    try {
      username = await getEbayUsername(access_token);
    } catch (e) {
      console.warn('⚠️ Could not fetch username, using timestamp');
      username = `user_${Date.now()}`;
    }
    
    // Save tokens securely
    await tokenManager.saveTokens(username, access_token, refresh_token, expires_in);
    
    console.log('✅ Tokens obtained and saved!');
    console.log(`   Username: ${username}`);
    
    // SUCCESS PAGE - No token details shown!
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Success - eBay OAuth</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>${pageStyles}</style>
      </head>
      <body class="center">
        <div class="success-icon">✅</div>
        <h1 class="success-title">Authorization Successful!</h1>
        
        <div class="user-badge">@${username}</div>
        
        <p style="color: #8892b0; max-width: 400px; margin: 1rem auto;">
          Your eBay account has been successfully connected. 
          Your credentials are now securely stored.
        </p>
        
        <div class="security-note" style="max-width: 400px; margin: 2rem auto; text-align: left;">
          <p>🔒 Your tokens are encrypted and only accessible to authorized backend systems.</p>
        </div>
        
        <a href="/" class="home-link">← Back to Home</a>
      </body>
      </html>
    `);
    
  } catch (error) {
    console.error('❌ Token exchange error:', error.message);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Error - eBay OAuth</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>${pageStyles}</style>
      </head>
      <body class="center">
        <div class="error-icon">❌</div>
        <h1 class="error-title">Authorization Failed</h1>
        <p style="color: #8892b0;">There was a problem completing the authorization.</p>
        <p style="color: #666; font-size: 0.9rem;">Error: ${error.message}</p>
        <a href="/auth/login" class="login-btn" style="margin-top: 1.5rem;">Try Again</a>
        <br>
        <a href="/" class="home-link">← Back to Home</a>
      </body>
      </html>
    `);
  }
});

// Health check endpoint (public)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// PROTECTED ROUTES - Require API_SECRET
// ============================================

// List all authorized users (usernames only, no tokens)
app.get('/api/users', requireApiSecret, async (req, res) => {
  try {
    const allTokens = await tokenManager.loadTokens();
    const users = Object.keys(allTokens).map(username => ({
      username,
      expiresAt: allTokens[username].expiresAt,
      isExpired: Date.now() >= (allTokens[username].expiresAt - 5 * 60 * 1000)
    }));
    
    res.json({ 
      count: users.length, 
      users 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get valid access token for a specific user (auto-refreshes if expired)
app.get('/api/get-token/:username?', requireApiSecret, async (req, res) => {
  try {
    const allTokens = await tokenManager.loadTokens();
    const users = Object.keys(allTokens);
    
    if (users.length === 0) {
      return res.status(404).json({ error: 'No tokens found' });
    }
    
    const username = req.params.username || users[0];
    const tokens = await tokenManager.getTokens(username);
    
    if (!tokens) {
      return res.status(404).json({ 
        error: `No tokens for user: ${username}`,
        availableUsers: users
      });
    }
    
    if (await tokenManager.isTokenExpired(username)) {
      console.log(`🔄 Refreshing expired token for ${username}...`);
      const response = await ebayAuthToken.getAccessToken(ENVIRONMENT, tokens.refreshToken, SCOPES);
      const data = typeof response === 'string' ? JSON.parse(response) : response;
      await tokenManager.updateAccessToken(username, data.access_token, data.expires_in);
      return res.json({ username, accessToken: data.access_token, refreshed: true });
    }
    
    res.json({ username, accessToken: tokens.accessToken, refreshed: false });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test API call for specific user
app.get('/api/test/:username?', requireApiSecret, async (req, res) => {
  try {
    const username = req.params.username || '';
    const allTokens = await tokenManager.loadTokens();
    const users = Object.keys(allTokens);
    
    if (users.length === 0) {
      return res.status(404).json({ error: 'No tokens found' });
    }
    
    const targetUser = username || users[0];
    const tokens = await tokenManager.getTokens(targetUser);
    
    if (!tokens) {
      return res.status(404).json({ 
        error: `No tokens for user: ${targetUser}`,
        availableUsers: users
      });
    }
    
    let accessToken = tokens.accessToken;
    let refreshed = false;
    
    if (await tokenManager.isTokenExpired(targetUser)) {
      console.log(`🔄 Refreshing expired token for ${targetUser}...`);
      const response = await ebayAuthToken.getAccessToken(ENVIRONMENT, tokens.refreshToken, SCOPES);
      const data = typeof response === 'string' ? JSON.parse(response) : response;
      await tokenManager.updateAccessToken(targetUser, data.access_token, data.expires_in);
      accessToken = data.access_token;
      refreshed = true;
    }
    
    const apiUrl = ENVIRONMENT === 'PRODUCTION' 
      ? 'https://api.ebay.com/sell/account/v1/privilege'
      : 'https://api.sandbox.ebay.com/sell/account/v1/privilege';
    
    const apiRes = await fetch(apiUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    const data = await apiRes.json();
    res.json({ success: true, username: targetUser, refreshed, data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// View all stored tokens (full data)
app.get('/api/tokens', requireApiSecret, async (req, res) => {
  try {
    const tokens = await tokenManager.loadTokens();
    res.json(tokens);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a user's tokens
app.delete('/api/tokens/:username', requireApiSecret, async (req, res) => {
  try {
    const { username } = req.params;
    await tokenManager.deleteTokens(username);
    res.json({ success: true, message: `Tokens deleted for ${username}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export for Vercel serverless
module.exports = app;
