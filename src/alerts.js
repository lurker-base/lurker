require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

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
  const { data: patterns, error } = await supabase
    .from('patterns')
    .select('*')
    .eq('alerted', false)
    .gte('confidence', 0.7) // Only high confidence
    .order('created_at', { ascending: false })
    .limit(10);

  if (error || !patterns || patterns.length === 0) {
    console.log('[LURKER] No pending alerts');
    return [];
  }

  const sent = [];
  for (const pattern of patterns) {
    const success = await sendAlert(pattern);
    if (success) {
      await supabase
        .from('patterns')
        .update({ alerted: true, alerted_at: new Date().toISOString() })
        .eq('id', pattern.id);
      sent.push(pattern);
    }
  }

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
