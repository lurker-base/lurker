require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { loadSignals, saveSignals } = require('./storage');

const bot = process.env.TELEGRAM_BOT_TOKEN ? 
  new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false }) : null;

const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

function formatAlert(signal, pattern) {
  const emoji = pattern.type === 'accumulation' ? '🐋' : '⚠️';
  const action = pattern.type === 'accumulation' ? 'ACCUMULATING' : 'DISTRIBUTING';
  
  return `
${emoji} **LURKER ALERT** ${emoji}

**${action} DETECTED**

👤 Wallet: \`${signal.wallet?.slice(0, 6)}...${signal.wallet?.slice(-4)}\`
📊 Confidence: ${Math.round(pattern.confidence * 100)}%
💰 Volume: ${pattern.details?.totalIn?.toFixed(2) || pattern.details?.totalOut?.toFixed(2)} ETH
📝 Transactions: ${pattern.details?.txCount}

🔗 [View on BaseScan](https://basescan.org/address/${signal.wallet})

_LURKER - Watching what matters_
  `.trim();
}

async function sendAlert(pattern) {
  if (!bot || !CHAT_ID) {
    console.log('[LURKER] Telegram not configured, logging alert only');
    return false;
  }
  
  const message = formatAlert(pattern, pattern);
  
  try {
    await bot.sendMessage(CHAT_ID, message, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
    console.log(`[LURKER] Alert sent for ${pattern.wallet}`);
    return true;
  } catch (err) {
    console.error('[LURKER] Telegram error:', err.message);
    return false;
  }
}

async function sendPendingAlerts() {
  const db = loadSignals();
  const patterns = db.patterns.filter(p => 
    !p.alerted && p.confidence >= 0.7
  ).slice(0, 10);

  if (patterns.length === 0) {
    console.log('[LURKER] No pending alerts');
    return [];
  }

  const sent = [];
  for (const pattern of patterns) {
    const success = await sendAlert(pattern);
    if (success) {
      pattern.alerted = true;
      pattern.alerted_at = new Date().toISOString();
      sent.push(pattern);
    }
  }
  
  saveSignals(db);
  return sent;
}

module.exports = { sendAlert, sendPendingAlerts };

if (require.main === module) {
  sendPendingAlerts()
    .then(sent => {
      console.log(`[LURKER] Sent ${sent.length} alerts`);
      process.exit(0);
    })
    .catch(err => {
      console.error('[LURKER] Error:', err);
      process.exit(1);
    });
}
