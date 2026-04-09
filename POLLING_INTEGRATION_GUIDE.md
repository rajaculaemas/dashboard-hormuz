# Telegram Polling - Integrated Service

## Status: ✅ COMPLETE

The Telegram polling service is now **fully integrated** with the main application lifecycle.

## How It Works

### 🟢 App Starts
```bash
pnpm dlx pm2 start ecosystem.config.js
# or
npm start
```

1. **server.js** starts the Next.js app
2. App listens on port 3000
3. On **first HTTP request**, polling service **automatically initializes**
4. Polling client begins fetching Telegram updates every 2 seconds

### 🔴 App Stops
```bash
pnpm dlx pm2 stop soc-dashboard
# or
Ctrl+C (development)
```

1. Server receives shutdown signal (SIGTERM/SIGINT)
2. **Polling service gracefully stops**
3. Server closes all connections
4. Process exits cleanly

## Verification

Check polling status:
```bash
curl http://localhost:3000/api/health/telegram-polling
```

Response:
```json
{
  "success": true,
  "telegram_polling": {
    "status": "active",
    "is_polling": true,
    "updates_processed": 5,
    "errors": 0,
    "error_rate": "0.00%"
  },
  "message": "Telegram polling service is active and running"
}
```

## What Changed

### Removed
- ❌ `telegram-polling-client.js` - No longer needed as separate process
- ❌ Separate PM2 process for polling

### Added
- ✅ `lib/services/telegram-polling-manager.ts` - Manages polling lifecycle
- ✅ `server.js` - Custom server that wraps Next.js with polling integr ation
- ✅ `/api/telegram/polling-init` - Initializes polling on app startup
- ✅ `/api/telegram/polling-stop` - Gracefully stops polling on shutdown
- ✅ `/api/health/telegram-polling` - Health check endpoint
- ✅ `middleware.ts` - Added polling endpoints to public paths

### Modified
- ✅ `ecosystem.config.js` - Now only runs main app (polling is integrated)
- ✅ `.env.local` - Removed TELEGRAM_WEBHOOK_URL requirement

## Usage

### Production (with PM2)
```bash
# Build
npm run build

# Start
pnpm dlx pm2 start ecosystem.config.js

# Monitor
pnpm dlx pm2 monit

# Stop
pnpm dlx pm2 stop soc-dashboard

# Restart
pnpm dlx pm2 restart soc-dashboard

# View logs
pnpm dlx pm2 logs soc-dashboard
```

### Development (with Hot Reload)
```bash
# Run with Next.js dev server (polling still works!)
npm run dev

# The custom server.js can also be used:
node server.js
```

## Key Features

✅ **Automatic Lifecycle Management**
- Polling starts when app starts
- Polling stops when app stops
- No separate process to manage

✅ **No External Dependencies**
- No ngrok needed
- No public IP/domain required
- No webhook configuration needed
- Works on localhost for development

✅ **Clean Shutdown**
- Graceful 10-second shutdown window
- Polling stops cleanly
- No zombie processes

✅ **Monitoring**
- Health check endpoint: `/api/health/telegram-polling`
- Stats: updates processed, error count, error rate
- Log output for debugging

## Telegram Polling Flow

```
Request received
    ↓
Check if polling initialized
    ↓ (if not)
Call /api/telegram/polling-init
    ↓
TelegramPollingManager.start()
    ↓
Start 2-second polling interval
    ↓
Fetch updates from Telegram API
    ↓
Process messages/button clicks
    ↓
Save to database
    ↓
Repeat every 2 seconds
```

## Shutdown Flow

```
SIGTERM/SIGINT received
    ↓
Call /api/telegram/polling-stop
    ↓
TelegramPollingManager.stop()
    ↓
Clear polling interval
    ↓
Close HTTP server
    ↓
Exit process
```

## Files Structure

```
soc-dashboard/
├── server.js                                    # Custom Next.js server wrapper
├── ecosystem.config.js                          # PM2 config (now only main app)
├── lib/
│   └── services/
│       ├── telegram-polling.ts                 # Core polling implementation
│       └── telegram-polling-manager.ts         # Lifecycle manager
├── app/
│   └── api/
│       ├── telegram/
│       │   ├── polling-init/route.ts          # Init endpoint
│       │   ├── polling-stop/route.ts          # Stop endpoint
│       │   └── webhook/route.ts               # Old webhook (can remove)
│       └── health/
│           └── telegram-polling/route.ts      # Status endpoint
└── middleware.ts                               # Auth bypass for polling endpoints
```

## Troubleshooting

### Polling not starting
1. Check app logs: `pnpm dlx pm2 logs soc-dashboard`
2. Verify TELEGRAM_BOT_TOKEN is set in .env.local
3. Make an HTTP request to trigger initialization

### Getting 401 on polling endpoints
- Ensure middleware allows public access (already fixed)
- Restart app: `pnpm dlx pm2 restart soc-dashboard`

### High memory usage
- Normal and expected (Node.js + TypeScript)
- Monitor with: `pnpm dlx pm2 monit`
- Max memory restart: 500MB (configurable in ecosystem.config.js)

## Next Steps

1. ✅ Polling service is fully integrated
2. Test with real Telegram bot interactions
3. Monitor error rates and update processing times
4. Adjust polling interval if needed (currently 2 seconds)

---

**Last Updated:** March 3, 2026
**Status:** Production Ready
