# LURKER API Server

Automated API key management with rate limiting and authentication.

## Setup

```bash
cd api
npm install
npm start
```

## Environment Variables

```bash
ADMIN_API_KEY=your_admin_key_here
JWT_SECRET=your_jwt_secret_here
DATABASE_URL=./data/api_keys.db
```

## API Endpoints

### Public (No Auth)
- `GET /health` - Health check
- `POST /verify-payment` - Verify payment and generate API key

### Authenticated (API Key Required)
- `GET /v1/signals/cio` - CIO feed (rate limited)
- `GET /v1/signals/watch` - Watch feed (rate limited)
- `GET /v1/signals/hotlist` - Hotlist feed (rate limited)
- `GET /v1/usage` - Check usage stats

### Admin (Admin Key Required)
- `GET /admin/keys` - List all API keys
- `POST /admin/keys/:id/revoke` - Revoke API key
- `GET /admin/stats` - Usage statistics

## Rate Limits

- **Basic**: 1,000 requests/day
- **Pro**: Unlimited requests
- **Pro Signals**: No API access (Telegram only)
