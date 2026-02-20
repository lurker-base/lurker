const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Configuration
const CONFIG = {
    dataFile: path.join(__dirname, '../data/whales.json'),
    alertsFile: path.join(__dirname, '../data/whaleAlerts.json'),
    scanInterval: 60000, // 1 minute
    
    // Wallets à surveiller (whales Base)
    trackedWallets: [
        // TODO: Remplacer par des vrais whales trouvés sur DeBank/Arkham
        // Exemples de formats:
        // '0x3c0d267e8de5d47a179fd89064f9c0bf9bd2f5f3', // Base Deployer
        // '0x...', // Whale DeBank #1
        // '0x...', // Whale DeBank #2
    ],
    
    // Seuils de détection
    thresholds: {
        accumulation: {
            minBought: 5,           // 5 achats consécutifs
            minEthSpent: 10,        // 10 ETH minimum
            timeWindow: 3600000     // Dans l'heure
        },
        distribution: {
            minSold: 3,             // 3 ventes
            minEthMoved: 20,        // 20 ETH
            toExchange: true        // Vers un exchange
        },
        awakening: {
            dormantDays: 30,        // Inactif 30+ jours
            minValue: 5             // Réveil avec 5+ ETH
        }
    }
};

// Ensure data directory
const dataDir = path.dirname(CONFIG.dataFile);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Load data
let whaleData = loadJSON(CONFIG.dataFile, { wallets: {}, alerts: [] });
let alerts = loadJSON(CONFIG.alertsFile, []);

function loadJSON(file, defaultVal = {}) {
    try {
        if (fs.existsSync(file)) {
            return JSON.parse(fs.readFileSync(file, 'utf8'));
        }
    } catch(e) {}
    return defaultVal;
}

function saveJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Fetch wallet transactions from BaseScan
async function getWalletTransactions(address) {
    try {
        // Note: Nécessite une API key BaseScan gratuite
        const apiKey = process.env.BASESCAN_API_KEY;
        if (!apiKey) {
            console.log('[WHALE] No API key, using mock data');
            return null;
        }
        
        const response = await axios.get(
            `https://api.basescan.org/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${apiKey}`,
            { timeout: 10000 }
        );
        
        if (response.data?.status === '1' && response.data.result) {
            return response.data.result;
        }
        return null;
    } catch (error) {
        console.error(`[WHALE] Error fetching txs for ${address}:`, error.message);
        return null;
    }
}

// Detect patterns
function detectPatterns(address, transactions) {
    const patterns = [];
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const oneDayAgo = now - 86400000;
    
    if (!transactions || transactions.length === 0) return patterns;
    
    // Get recent transactions (last 24h)
    const recentTxs = transactions.filter(tx => {
        const txTime = parseInt(tx.timeStamp) * 1000;
        return txTime > oneDayAgo;
    });
    
    // Check for accumulation (consecutive buys)
    const buys = recentTxs.filter(tx => 
        tx.to.toLowerCase() === address.toLowerCase() && 
        parseFloat(tx.value) > 0
    );
    
    const totalBought = buys.reduce((sum, tx) => sum + parseFloat(tx.value) / 1e18, 0);
    
    if (buys.length >= CONFIG.thresholds.accumulation.minBought && 
        totalBought >= CONFIG.thresholds.accumulation.minEthSpent) {
        patterns.push({
            type: 'accumulation',
            confidence: Math.min(95, 70 + buys.length * 5),
            details: {
                buys: buys.length,
                totalEth: totalBought.toFixed(2),
                avgBuy: (totalBought / buys.length).toFixed(3)
            }
        });
    }
    
    // Check for distribution (large sells)
    const sells = recentTxs.filter(tx => 
        tx.from.toLowerCase() === address.toLowerCase() && 
        parseFloat(tx.value) > 0
    );
    
    const totalSold = sells.reduce((sum, tx) => sum + parseFloat(tx.value) / 1e18, 0);
    
    if (sells.length >= CONFIG.thresholds.distribution.minSold && 
        totalSold >= CONFIG.thresholds.distribution.minEthMoved) {
        patterns.push({
            type: 'distribution',
            confidence: Math.min(95, 75 + sells.length * 5),
            details: {
                sells: sells.length,
                totalEth: totalSold.toFixed(2),
                toExchange: 'unknown' // Would need exchange address matching
            }
        });
    }
    
    // Check for awakening (dormant then active)
    const lastTx = transactions[0];
    const lastTxTime = parseInt(lastTx.timeStamp) * 1000;
    const thirtyDaysAgo = now - (30 * 86400000);
    
    // Check if was dormant
    const olderTxs = transactions.filter(tx => {
        const txTime = parseInt(tx.timeStamp) * 1000;
        return txTime < thirtyDaysAgo;
    });
    
    if (olderTxs.length > 0 && lastTxTime > oneDayAgo) {
        const dormantDays = Math.floor((now - parseInt(olderTxs[0].timeStamp) * 1000) / 86400000);
        const awakeningValue = parseFloat(lastTx.value) / 1e18;
        
        if (dormantDays >= CONFIG.thresholds.awakening.dormantDays &&
            awakeningValue >= CONFIG.thresholds.awakening.minValue) {
            patterns.push({
                type: 'awakening',
                confidence: 85,
                details: {
                    dormantDays,
                    awakeningValue: awakeningValue.toFixed(2)
                }
            });
        }
    }
    
    return patterns;
}

// Generate alert
function generateAlert(wallet, pattern, transactions) {
    const emoji = {
        accumulation: '🟢',
        distribution: '🔴',
        awakening: '⚪'
    }[pattern.type];
    
    const labels = {
        accumulation: 'ACCUMULATION',
        distribution: 'DISTRIBUTION',
        awakening: 'AWAKENING'
    }[pattern.type];
    
    const alert = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        type: pattern.type,
        wallet: wallet,
        walletShort: `${wallet.slice(0, 6)}...${wallet.slice(-4)}`,
        confidence: pattern.confidence,
        emoji: emoji,
        label: labels,
        details: pattern.details,
        timestamp: Date.now(),
        timeFormatted: new Date().toISOString(),
        explorerLink: `https://basescan.org/address/${wallet}`
    };
    
    return alert;
}

// Main scan
async function scanWhales() {
    console.log('[WHALE] Scanning for whale activity...');
    
    for (const wallet of CONFIG.trackedWallets) {
        console.log(`[WHALE] Checking ${wallet}...`);
        
        const transactions = await getWalletTransactions(wallet);
        if (!transactions) continue;
        
        const patterns = detectPatterns(wallet, transactions);
        
        for (const pattern of patterns) {
            // Check if we already alerted for this pattern recently
            const recentAlert = alerts.find(a => 
                a.wallet === wallet && 
                a.type === pattern.type && 
                Date.now() - a.timestamp < 3600000 // 1 hour cooldown
            );
            
            if (!recentAlert) {
                const alert = generateAlert(wallet, pattern, transactions);
                alerts.unshift(alert);
                if (alerts.length > 100) alerts.pop();
                
                console.log(`[WHALE] 🚨 ALERT: ${pattern.type} detected for ${wallet}`);
                console.log(`         Confidence: ${pattern.confidence}%`);
                console.log(`         Details:`, pattern.details);
            }
        }
        
        // Update whale data
        whaleData.wallets[wallet] = {
            lastChecked: Date.now(),
            txCount: transactions.length,
            lastPatterns: patterns.map(p => p.type)
        };
    }
    
    // Save
    saveJSON(CONFIG.alertsFile, alerts);
    saveJSON(CONFIG.dataFile, whaleData);
    
    console.log(`[WHALE] Scan complete. Total alerts: ${alerts.length}`);
}

// Run
console.log('[WHALE] Whale detector started');
console.log('[WHALE] Tracking', CONFIG.trackedWallets.length, 'wallets');
console.log('[WHALE] Note: Add BASESCAN_API_KEY env var for real data');

// Initial scan
scanWhales();

// Schedule
setInterval(scanWhales, CONFIG.scanInterval);

// Export for use in other modules
module.exports = { scanWhales, alerts };
