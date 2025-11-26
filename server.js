/**
 * eBay OAuth Server - Multi-User Support
 * 
 * Handles OAuth 2.0 Authorization Code Grant flow:
 * 1. User visits /auth/login → redirected to eBay
 * 2. User authorizes → eBay redirects to /auth/callback with code
 * 3. Server exchanges code for tokens → fetches username → stores them
 * 4. Use /api/get-token/:username to get valid tokens for API calls
 */

const express = require('express');
const EbayAuthToken = require('ebay-oauth-nodejs-client');
const tokenManager = require('./tokenManager');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

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

console.log('\n📋 Configuration:');
console.log(`   Environment: ${ENVIRONMENT}`);
console.log(`   Client ID: ${process.env.EBAY_CLIENT_ID}`);
console.log(`   RuName: ${process.env.EBAY_REDIRECT_URI}`);
console.log(`   Scopes: ${SCOPES.length} scope(s)\n`);

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
    tokenManager.saveTokens(username, access_token, refresh_token, expires_in);
    
    console.log('✅ Tokens obtained and saved!');
    console.log(`   Username: ${username}`);
    console.log(`   Access Token: ${access_token.substring(0, 30)}...`);
    console.log(`   Refresh Token: ${refresh_token.substring(0, 30)}...`);
    console.log(`   Expires in: ${expires_in}s`);
    
    res.send(`
      <h1>✅ Success!</h1>
      <p><strong>User:</strong> ${username}</p>
      <p>Tokens saved. You can now make API calls.</p>
      <p>
        <a href="/api/get-token/${username}">Get Token</a> | 
        <a href="/api/test/${username}">Test API Call</a> | 
        <a href="/tokens">View All Tokens</a>
      </p>
      <hr>
      <p><a href="/auth/login">Add Another User</a></p>
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
    const allTokens = tokenManager.loadTokens();
    const users = Object.keys(allTokens);
    
    if (users.length === 0) {
      return res.status(404).json({ error: 'No tokens found. Authorize first at /auth/login' });
    }
    
    // Use provided username or first available
    const username = req.params.username || users[0];
    const tokens = tokenManager.getTokens(username);
    
    if (!tokens) {
      return res.status(404).json({ 
        error: `No tokens for user: ${username}`,
        availableUsers: users
      });
    }
    
    if (tokenManager.isTokenExpired(username)) {
      console.log(`🔄 Refreshing expired token for ${username}...`);
      const response = await ebayAuthToken.getAccessToken(ENVIRONMENT, tokens.refreshToken, SCOPES);
      const data = typeof response === 'string' ? JSON.parse(response) : response;
      tokenManager.updateAccessToken(username, data.access_token, data.expires_in);
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
    const tokenRes = await fetch(`http://localhost:${PORT}/api/get-token/${username}`);
    const tokenData = await tokenRes.json();
    
    if (tokenData.error) return res.status(500).json(tokenData);
    
    const apiUrl = ENVIRONMENT === 'PRODUCTION' 
      ? 'https://api.ebay.com/sell/account/v1/privilege'
      : 'https://api.sandbox.ebay.com/sell/account/v1/privilege';
    
    const apiRes = await fetch(apiUrl, {
      headers: { 'Authorization': `Bearer ${tokenData.accessToken}` }
    });
    
    const data = await apiRes.json();
    res.json({ success: true, username: tokenData.username, data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// View stored tokens
app.get('/tokens', (req, res) => {
  const tokens = tokenManager.loadTokens();
  const users = Object.keys(tokens);
  
  // Return HTML for browser, JSON for API calls
  if (req.headers.accept?.includes('text/html')) {
    let html = '<h1>Stored Tokens</h1>';
    html += `<p><strong>${users.length}</strong> user(s) authorized</p><ul>`;
    for (const user of users) {
      html += `<li><strong>${user}</strong> - <a href="/api/get-token/${user}">Get Token</a> | <a href="/api/test/${user}">Test</a></li>`;
    }
    html += '</ul><hr><p><a href="/auth/login">Add Another User</a></p>';
    html += '<h3>Raw JSON:</h3><pre>' + JSON.stringify(tokens, null, 2) + '</pre>';
    res.send(html);
  } else {
    res.json(tokens);
  }
});

// Home
app.get('/', (req, res) => {
  const tokens = tokenManager.loadTokens();
  const users = Object.keys(tokens);
  
  let userList = '';
  if (users.length > 0) {
    userList = '<h3>Authorized Users:</h3><ul>';
    for (const user of users) {
      userList += `<li><strong>${user}</strong> - <a href="/api/get-token/${user}">Get Token</a> | <a href="/api/test/${user}">Test</a></li>`;
    }
    userList += '</ul>';
  }
  
  res.send(`
    <h1>eBay OAuth Server</h1>
    <p><a href="/auth/login">➕ Add/Authorize User</a></p>
    ${userList}
    <hr>
    <h3>Endpoints:</h3>
    <ul>
      <li><code>/auth/login</code> - Start OAuth flow</li>
      <li><code>/api/get-token/:username</code> - Get access token for user</li>
      <li><code>/api/test/:username</code> - Test API call for user</li>
      <li><code>/tokens</code> - View all stored tokens</li>
    </ul>
  `);
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`   Start OAuth: http://localhost:${PORT}/auth/login\n`);
});
