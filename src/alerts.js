const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Load config
const envPath = path.join(__dirname, '..', '.env.telegram');
let config = {};
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) config[key.trim()] = value.trim();
    });
}

const BOT_TOKEN = config.TELEGRAM_BOT_TOKEN;
const CHAT_ID = config.CHAT_ID || '7473322586';

// Set webhook to ignore incoming messages (we only send signals)
async function setupWebhook() {
    if (!BOT_TOKEN) return;
    
    try {
        // Delete webhook so bot doesn't respond to messages
        await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook`);
        console.log('[LURKER] Webhook cleared - bot in signal-only mode');
    } catch (error) {
        console.error('[LURKER] Could not clear webhook:', error.message);
    }
}

async function sendSignal(signal) {
    if (!BOT_TOKEN) {
        console.error('[LURKER] No bot token configured');
        return false;
    }

    const emoji = signal.type === 'accumulation' ? '🟠' : 
                  signal.type === 'distribution' ? '🔴' : '⚪';
    
    const message = `${emoji} **LURKER ALERT — ${signal.type.toUpperCase()} DETECTED**

**Wallet:** \`${signal.wallet}\`
**Pattern:** ${signal.pattern}
**Timeframe:** ${signal.timeframe}
**Confidence:** ${signal.confidence}%

**Previous:** ${signal.previousActivity}
**Current:** ${signal.currentHoldings}

🔗 [View on BaseScan](${signal.explorerLink})

---
*lurker // watching the depths*
*block ${signal.block}* | ${signal.timestamp}`;

    try {
        const response = await axios.post(
            `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
            {
                chat_id: CHAT_ID,
                text: message,
                parse_mode: 'Markdown',
                disable_web_page_preview: false
            }
        );
        
        if (response.data.ok) {
            console.log('[LURKER] Signal sent to Telegram');
            return true;
        }
    } catch (error) {
        console.error('[LURKER] Failed to send signal:', error.message);
        if (error.response) {
            console.error('[LURKER] Response:', error.response.data);
        }
    }
    
    return false;
}

// Setup on load
setupWebhook();

// Test signal
if (require.main === module) {
    const testSignal = {
        id: 'test_001',
        type: 'accumulation',
        confidence: 87,
        wallet: '0x7Bf0...1542',
        pattern: '3 consecutive buys (12.5 → 15.2 → 18.8 ETH)',
        timeframe: '15 minutes',
        previousActivity: 'Dormant 23 days',
        currentHoldings: '~450 ETH',
        explorerLink: 'https://basescan.org/address/0x7Bf015421542',
        block: 42385291,
        timestamp: new Date().toISOString()
    };
    
    sendSignal(testSignal).then(success => {
        if (success) {
            console.log('[LURKER] Test signal sent successfully');
        } else {
            console.log('[LURKER] Test signal failed');
        }
        process.exit(0);
    });
}

module.exports = { sendSignal, setupWebhook };
