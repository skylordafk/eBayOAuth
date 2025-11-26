/**
 * eBay OAuth Server - Vercel Serverless Entry Point
 * 
 * Handles OAuth 2.0 Authorization Code Grant flow:
 * 1. User visits /auth/login → redirected to eBay
 * 2. User authorizes → eBay redirects to /auth/callback with code
 * 3. Server exchanges code for tokens → fetches username → stores them
 * 4. Use /api/get-token/:username to get valid tokens for API calls
 */

const express = require('express');
const EbayAuthToken = require('ebay-oauth-nodejs-client');

// Use Vercel KV-based token manager for persistent storage
const tokenManager = require('../tokenManager.vercel');

const app = express();

// Configuration
const ENVIRONMENT = (process.env.EBAY_ENVIRONMENT || 'PRODUCTION').toUpperCase();
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

// Home page with styled UI
app.get('/', async (req, res) => {
  const tokens = await tokenManager.loadTokens();
  const users = Object.keys(tokens);
  
  let userList = '';
  if (users.length > 0) {
    userList = '<div class="users"><h3>🔐 Authorized Users:</h3><ul>';
    for (const user of users) {
      userList += `
        <li>
          <strong>${user}</strong>
          <span class="links">
            <a href="/api/get-token/${user}">Get Token</a>
            <a href="/api/test/${user}">Test API</a>
          </span>
        </li>`;
    }
    userList += '</ul></div>';
  }
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>eBay OAuth Server</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          max-width: 800px;
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
        .users {
          margin-top: 2rem;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          padding: 20px;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .users h3 { margin-top: 0; color: #64ffda; }
        .users ul { list-style: none; padding: 0; }
        .users li {
          padding: 12px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .users li:last-child { border-bottom: none; }
        .links a {
          color: #64ffda;
          text-decoration: none;
          margin-left: 12px;
          font-size: 0.9rem;
        }
        .links a:hover { text-decoration: underline; }
        .endpoints {
          margin-top: 2rem;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 12px;
          padding: 20px;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .endpoints h3 { margin-top: 0; color: #8892b0; }
        .endpoints code {
          background: rgba(100, 255, 218, 0.1);
          color: #64ffda;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 0.9rem;
        }
        .endpoints ul { padding-left: 20px; }
        .endpoints li { margin: 10px 0; color: #a8b2c1; }
      </style>
    </head>
    <body>
      <h1>🛒 eBay OAuth Server</h1>
      <p class="subtitle">Secure OAuth 2.0 authorization for eBay API access</p>
      
      <a href="/auth/login" class="login-btn">➕ Authorize eBay Account</a>
      
      ${userList}
      
      <div class="endpoints">
        <h3>📡 API Endpoints</h3>
        <ul>
          <li><code>GET /auth/login</code> — Start OAuth authorization flow</li>
          <li><code>GET /api/get-token/:username</code> — Get access token for a user</li>
          <li><code>GET /api/test/:username</code> — Test API call for a user</li>
          <li><code>GET /tokens</code> — View all stored tokens</li>
        </ul>
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
    res.status(500).json({ error: error.message });
  }
});

// OAuth callback - receives authorization code from eBay
app.get('/auth/callback', async (req, res) => {
  const { code, error } = req.query;
  
  console.log('\n📥 Callback received');
  console.log('   Query params:', req.query);
  
  if (error) {
    console.error('❌ Error from eBay:', error);
    return res.status(400).json({ error });
  }
  
  if (!code) {
    return res.status(400).json({ error: 'No authorization code received' });
  }
  
  try {
    console.log('🔄 Exchanging code for tokens...');
    const response = await ebayAuthToken.exchangeCodeForAccessToken(ENVIRONMENT, code);
    const tokenData = typeof response === 'string' ? JSON.parse(response) : response;
    
    const { access_token, refresh_token, expires_in } = tokenData;
    
    if (!access_token || !refresh_token) {
      throw new Error('Invalid token response');
    }
    
    // Fetch the eBay username to use as unique identifier
    console.log('🔍 Fetching eBay username...');
    let username;
    try {
      username = await getEbayUsername(access_token);
    } catch (e) {
      // Fallback: use timestamp if can't get username
      console.warn('⚠️ Could not fetch username, using timestamp');
      username = `user_${Date.now()}`;
    }
    
    // Save tokens with username as key
    await tokenManager.saveTokens(username, access_token, refresh_token, expires_in);
    
    console.log('✅ Tokens obtained and saved!');
    console.log(`   Username: ${username}`);
    console.log(`   Access Token: ${access_token.substring(0, 30)}...`);
    console.log(`   Refresh Token: ${refresh_token.substring(0, 30)}...`);
    console.log(`   Expires in: ${expires_in}s`);
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Success - eBay OAuth</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 600px;
            margin: 0 auto;
            padding: 60px 20px;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            min-height: 100vh;
            color: #e8e8e8;
            text-align: center;
          }
          .success-icon { font-size: 4rem; margin-bottom: 1rem; }
          h1 { color: #64ffda; margin-bottom: 0.5rem; }
          .user { color: #fff; font-size: 1.2rem; margin: 1rem 0; }
          .links {
            margin-top: 2rem;
            display: flex;
            gap: 1rem;
            justify-content: center;
            flex-wrap: wrap;
          }
          .links a {
            color: #64ffda;
            text-decoration: none;
            padding: 10px 20px;
            border: 1px solid #64ffda;
            border-radius: 6px;
            transition: all 0.2s;
          }
          .links a:hover {
            background: rgba(100, 255, 218, 0.1);
          }
          .home-link {
            margin-top: 2rem;
            display: inline-block;
            color: #8892b0;
          }
        </style>
      </head>
      <body>
        <div class="success-icon">✅</div>
        <h1>Authorization Successful!</h1>
        <p class="user">User: <strong>${username}</strong></p>
        <p style="color: #8892b0;">Your eBay tokens have been securely stored.</p>
        
        <div class="links">
          <a href="/api/get-token/${username}">Get Token</a>
          <a href="/api/test/${username}">Test API Call</a>
          <a href="/tokens">View All Tokens</a>
        </div>
        
        <a href="/" class="home-link">← Back to Home</a>
      </body>
      </html>
    `);
    
  } catch (error) {
    console.error('❌ Token exchange error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get valid access token for a specific user (auto-refreshes if expired)
app.get('/api/get-token/:username?', async (req, res) => {
  try {
    // If no username provided, list available users
    const allTokens = await tokenManager.loadTokens();
    const users = Object.keys(allTokens);
    
    if (users.length === 0) {
      return res.status(404).json({ error: 'No tokens found. Authorize first at /auth/login' });
    }
    
    // Use provided username or first available
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
app.get('/api/test/:username?', async (req, res) => {
  try {
    const username = req.params.username || '';
    
    // Get token directly instead of making HTTP request to self
    const allTokens = await tokenManager.loadTokens();
    const users = Object.keys(allTokens);
    
    if (users.length === 0) {
      return res.status(404).json({ error: 'No tokens found. Authorize first at /auth/login' });
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

// View stored tokens
app.get('/tokens', async (req, res) => {
  const tokens = await tokenManager.loadTokens();
  const users = Object.keys(tokens);
  
  // Return HTML for browser, JSON for API calls
  if (req.headers.accept?.includes('text/html')) {
    let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Stored Tokens - eBay OAuth</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 900px;
            margin: 0 auto;
            padding: 40px 20px;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            min-height: 100vh;
            color: #e8e8e8;
          }
          h1 { color: #fff; }
          .count { color: #64ffda; }
          ul { list-style: none; padding: 0; }
          li {
            background: rgba(255, 255, 255, 0.05);
            padding: 15px 20px;
            margin: 10px 0;
            border-radius: 8px;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          a { color: #64ffda; text-decoration: none; margin-left: 15px; }
          a:hover { text-decoration: underline; }
          pre {
            background: rgba(0, 0, 0, 0.3);
            padding: 20px;
            border-radius: 8px;
            overflow-x: auto;
            font-size: 0.85rem;
          }
          .home-link { color: #8892b0; display: inline-block; margin-top: 2rem; }
        </style>
      </head>
      <body>
        <h1>🔑 Stored Tokens</h1>
        <p><span class="count">${users.length}</span> user(s) authorized</p>
        <ul>`;
    
    for (const user of users) {
      html += `
          <li>
            <strong>${user}</strong>
            <span>
              <a href="/api/get-token/${user}">Get Token</a>
              <a href="/api/test/${user}">Test</a>
            </span>
          </li>`;
    }
    
    // Mask sensitive data in the display
    const maskedTokens = {};
    for (const [user, data] of Object.entries(tokens)) {
      maskedTokens[user] = {
        ...data,
        accessToken: data.accessToken?.substring(0, 30) + '...[hidden]',
        refreshToken: data.refreshToken?.substring(0, 20) + '...[hidden]'
      };
    }
    
    html += `
        </ul>
        <h3>Raw Data (tokens masked):</h3>
        <pre>${JSON.stringify(maskedTokens, null, 2)}</pre>
        <a href="/" class="home-link">← Back to Home</a>
      </body>
      </html>`;
    res.send(html);
  } else {
    res.json(tokens);
  }
});

// Export for Vercel serverless
module.exports = app;

