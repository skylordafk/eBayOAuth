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

## Vercel Deployment

This project supports deployment to Vercel with persistent token storage via Vercel KV (Redis).

### 1. Deploy to Vercel

```bash
npm install -g vercel
vercel login
vercel --yes
```

### 2. Set Up Vercel KV (Redis)

1. Go to your [Vercel Dashboard](https://vercel.com)
2. Select your project → **Storage** tab
3. Click **Create** → Choose **KV** (Redis)
4. Name it (e.g., `ebay-tokens`)
5. Click **Create** → It auto-links to your project

This creates the `KV_*` environment variables automatically.

### 3. Add Environment Variables

```bash
vercel env add EBAY_CLIENT_ID production
vercel env add EBAY_CLIENT_SECRET production
vercel env add EBAY_REDIRECT_URI production
vercel env add EBAY_ENVIRONMENT production    # PRODUCTION or SANDBOX
vercel env add EBAY_SCOPES production          # Comma-separated scopes
```

### 4. Update eBay Developer Portal

Add your Vercel URL to the OAuth redirect URLs in eBay Developer Portal:
```
https://your-project.vercel.app/auth/callback
```

### 5. Redeploy

```bash
vercel --prod
```

### Vercel URLs

After deployment, your endpoints will be:
- **Auth**: `https://your-project.vercel.app/auth/login`
- **Get Token**: `https://your-project.vercel.app/api/get-token/:username`
- **Test API**: `https://your-project.vercel.app/api/test/:username`

## Production Notes

- The Vercel deployment uses **Vercel KV** (Redis) for persistent token storage
- Tokens are stored securely and persist across serverless function invocations
- Use HTTPS (automatic with Vercel)
- Consider adding authentication to protect endpoints
- Monitor usage in Vercel Dashboard

## License

MIT
