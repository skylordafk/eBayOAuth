# eBay OAuth Server

A Node.js server for handling eBay OAuth 2.0 authorization, allowing you to make API calls on behalf of eBay users.

## Features

- **OAuth 2.0 Authorization Code Grant** flow
- **Multi-user support** - authorize multiple eBay accounts
- **Automatic token refresh** - access tokens refresh seamlessly
- **Persistent storage** - refresh tokens stored for long-term access

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Credentials

```bash
cp .env.example .env
```

Edit `.env` with your eBay Developer credentials from [developer.ebay.com/my/keys](https://developer.ebay.com/my/keys):

- `EBAY_CLIENT_ID` - Your App ID
- `EBAY_CLIENT_SECRET` - Your Cert ID  
- `EBAY_DEV_ID` - Your Dev ID
- `EBAY_REDIRECT_URI` - Your RuName (the identifier, not a URL)

### 3. Configure Callback URL in eBay Developer Portal

In the eBay Developer Portal, set your OAuth redirect URL to:
- Local: `http://localhost:3000/auth/callback`
- Production: `https://yourdomain.com/auth/callback`

### 4. Start the Server

```bash
npm start
```

Visit `http://localhost:3000/auth/login` to authorize your first user.

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `/auth/login` | Start OAuth flow |
| `/auth/callback` | OAuth callback (called by eBay) |
| `/api/get-token/:username` | Get valid access token (auto-refreshes) |
| `/api/test/:username` | Test API call |
| `/tokens` | View all authorized users |

## Usage Example

```javascript
// Get a valid access token
const response = await fetch('http://localhost:3000/api/get-token/username');
const { accessToken } = await response.json();

// Use in eBay API calls
const ebayResponse = await fetch('https://api.ebay.com/sell/account/v1/privilege', {
  headers: { 'Authorization': `Bearer ${accessToken}` }
});
```

## How OAuth 2.0 Works

1. User visits `/auth/login` → redirected to eBay
2. User authorizes → eBay redirects back with code
3. Server exchanges code → gets access + refresh tokens
4. Tokens stored → make API calls indefinitely

**Key Points:**
- **Access Token**: Used for API calls, expires in ~2 hours
- **Refresh Token**: Long-lived, used to get new access tokens (stored permanently)

## Troubleshooting

### "Invalid redirect_uri"
- Ensure `EBAY_REDIRECT_URI` is your RuName (identifier), not a full URL
- Verify callback URL is configured in eBay Developer Portal

### "Authorization code expired"
- Codes expire quickly - ensure server is running during authorization

### "Invalid scope"
- Check scopes in `.env` are valid and enabled for your app

## Production Notes

- Use HTTPS for production
- Consider using a database instead of `tokens.json`
- Add authentication to protect endpoints
- Encrypt tokens at rest

## License

MIT
