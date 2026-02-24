const express = require('express');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Database setup
const db = new Database(process.env.DATABASE_URL || './data/api_keys.db');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    tier TEXT NOT NULL,
    telegram_username TEXT,
    payment_id TEXT UNIQUE,
    payment_tx_hash TEXT,
    payment_amount INTEGER,
    payment_chain TEXT,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    requests_today INTEGER DEFAULT 0,
    requests_total INTEGER DEFAULT 0,
    last_request_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS request_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_key_id TEXT,
    endpoint TEXT,
    ip_address TEXT,
    user_agent TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
  );

  CREATE INDEX IF NOT EXISTS idx_api_keys ON api_keys(key);
  CREATE INDEX IF NOT EXISTS idx_request_logs ON request_logs(api_key_id, timestamp);
`);

// Helper functions
function generateApiKey() {
  return 'lurker_' + uuidv4().replace(/-/g, '');
}

function getTierLimits(tier) {
  switch(tier) {
    case 'api_basic':
      return { daily: 1000, monthly: 30000 };
    case 'api_pro':
      return { daily: Infinity, monthly: Infinity };
    default:
      return { daily: 0, monthly: 0 };
  }
}

// Authentication middleware
function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['authorization']?.replace('Bearer ', '') || 
                 req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }

  const keyData = db.prepare('SELECT * FROM api_keys WHERE key = ? AND is_active = 1').get(apiKey);
  
  if (!keyData) {
    return res.status(401).json({ error: 'Invalid or revoked API key' });
  }

  // Check expiration
  if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
    return res.status(401).json({ error: 'API key expired' });
  }

  // Reset daily counter if it's a new day
  const lastRequest = keyData.last_request_at ? new Date(keyData.last_request_at) : null;
  const now = new Date();
  if (!lastRequest || lastRequest.getDate() !== now.getDate()) {
    db.prepare('UPDATE api_keys SET requests_today = 0 WHERE id = ?').run(keyData.id);
    keyData.requests_today = 0;
  }

  // Check rate limit
  const limits = getTierLimits(keyData.tier);
  if (keyData.requests_today >= limits.daily) {
    return res.status(429).json({ 
      error: 'Rate limit exceeded',
      limit: limits.daily,
      reset_at: new Date(now.setHours(24, 0, 0, 0)).toISOString()
    });
  }

  // Update usage
  db.prepare(`
    UPDATE api_keys 
    SET requests_today = requests_today + 1,
        requests_total = requests_total + 1,
        last_request_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(keyData.id);

  // Log request
  db.prepare(`
    INSERT INTO request_logs (api_key_id, endpoint, ip_address, user_agent)
    VALUES (?, ?, ?, ?)
  `).run(keyData.id, req.path, req.ip, req.headers['user-agent']);

  req.apiKey = keyData;
  next();
}

// Admin authentication
function authenticateAdmin(req, res, next) {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Verify payment and generate API key (called after payment confirmation)
app.post('/verify-payment', authenticateAdmin, (req, res) => {
  const { 
    payment_id, 
    tx_hash, 
    telegram_username, 
    tier, 
    amount, 
    chain,
    expires_at 
  } = req.body;

  if (!payment_id || !tx_hash || !tier) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Check if payment already processed
  const existing = db.prepare('SELECT * FROM api_keys WHERE payment_id = ? OR payment_tx_hash = ?').get(payment_id, tx_hash);
  if (existing) {
    return res.status(409).json({ error: 'Payment already processed', api_key: existing.key });
  }

  // Generate new API key
  const apiKey = generateApiKey();
  const id = uuidv4();

  try {
    db.prepare(`
      INSERT INTO api_keys (id, key, tier, telegram_username, payment_id, payment_tx_hash, payment_amount, payment_chain, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, apiKey, tier, telegram_username, payment_id, tx_hash, amount, chain, expires_at);

    res.json({
      success: true,
      api_key: apiKey,
      tier: tier,
      expires_at: expires_at,
      message: 'API key generated successfully'
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate API key', details: err.message });
  }
});

// Get usage stats (authenticated)
app.get('/v1/usage', authenticateApiKey, (req, res) => {
  const limits = getTierLimits(req.apiKey.tier);
  res.json({
    tier: req.apiKey.tier,
    requests_today: req.apiKey.requests_today,
    requests_total: req.apiKey.requests_total,
    daily_limit: limits.daily,
    remaining_today: limits.daily === Infinity ? 'unlimited' : limits.daily - req.apiKey.requests_today,
    expires_at: req.apiKey.expires_at
  });
});

// Signal feeds (authenticated)
const signalFeeds = ['cio', 'watch', 'hotlist', 'fast_certified', 'certified'];

signalFeeds.forEach(feed => {
  app.get(`/v1/signals/${feed}`, authenticateApiKey, (req, res) => {
    try {
      // In production, this would fetch from your actual data source
      // For now, return a placeholder
      res.json({
        feed: feed,
        timestamp: new Date().toISOString(),
        count: 0,
        signals: [],
        message: 'Feed data would be here - integrate with your actual data source'
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch feed' });
    }
  });
});

// Admin routes

// List all API keys
app.get('/admin/keys', authenticateAdmin, (req, res) => {
  const keys = db.prepare(`
    SELECT id, key, tier, telegram_username, is_active, 
           requests_today, requests_total, created_at, expires_at
    FROM api_keys
    ORDER BY created_at DESC
  `).all();
  res.json({ count: keys.length, keys });
});

// Revoke API key
app.post('/admin/keys/:id/revoke', authenticateAdmin, (req, res) => {
  const { id } = req.params;
  db.prepare('UPDATE api_keys SET is_active = 0 WHERE id = ?').run(id);
  res.json({ success: true, message: 'API key revoked' });
});

// Get stats
app.get('/admin/stats', authenticateAdmin, (req, res) => {
  const stats = db.prepare(`
    SELECT 
      tier,
      COUNT(*) as key_count,
      SUM(requests_total) as total_requests,
      SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_keys
    FROM api_keys
    GROUP BY tier
  `).all();

  const dailyRequests = db.prepare(`
    SELECT DATE(timestamp) as date, COUNT(*) as count
    FROM request_logs
    WHERE timestamp > DATE('now', '-7 days')
    GROUP BY DATE(timestamp)
    ORDER BY date DESC
  `).all();

  res.json({
    tier_stats: stats,
    daily_requests: dailyRequests,
    total_keys: db.prepare('SELECT COUNT(*) as count FROM api_keys').get().count,
    total_requests: db.prepare('SELECT COUNT(*) as count FROM request_logs').get().count
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.listen(PORT, () => {
  console.log(`🚀 LURKER API Server running on port ${PORT}`);
  console.log(`📊 Admin panel: http://localhost:${PORT}/admin/keys`);
});
