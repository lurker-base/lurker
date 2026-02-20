const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Config
const CONFIG = {
    minLiquidityUSD: 5000,
    minVolume24h: 5000,
    maxAgeHours: 48,
    scanInterval: 30000, // 30 seconds for live demo
    dataFile: path.join(__dirname, '../data/signals.json')
};

// Ensure data directory exists
const dataDir = path.dirname(CONFIG.dataFile);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Load existing signals
let signals = [];
try {
    if (fs.existsSync(CONFIG.dataFile)) {
        signals = JSON.parse(fs.readFileSync(CONFIG.dataFile, 'utf8'));
    }
} catch(e) {
    console.log('[LIVE] Starting fresh');
}

// Calculate score
function calculateScore(data) {
    let score = 0;
    const checks = [];
    
    if (data.liquidityUSD > 50000) { score += 30; checks.push('high_liq'); }
    else if (data.liquidityUSD > 10000) { score += 20; checks.push('good_liq'); }
    else if (data.liquidityUSD > 5000) { score += 10; checks.push('min_liq'); }
    
    if (data.volume24h > 100000) { score += 25; checks.push('high_vol'); }
    else if (data.volume24h > 50000) { score += 20; checks.push('good_vol'); }
    else if (data.volume24h > 5000) { score += 10; checks.push('min_vol'); }
    
    if (data.marketCap > 1000000) { score += 15; checks.push('high_mcap'); }
    else if (data.marketCap > 100000) { score += 10; checks.push('med_mcap'); }
    
    const totalTxns = (data.txns24h?.buys || 0) + (data.txns24h?.sells || 0);
    if (totalTxns > 1000) { score += 15; checks.push('high_txn'); }
    else if (totalTxns > 100) { score += 10; checks.push('good_txn'); }
    
    if (data.ageHours > 24) { score += 10; checks.push('established'); }
    else if (data.ageHours > 6) { score += 5; checks.push('not_new'); }
    
    const hourlyVolume = data.volume1h || 0;
    if (hourlyVolume > (data.volume24h / 12)) { score += 10; checks.push('vol_spike'); }
    
    return { score: Math.min(100, score), checks };
}

// Get token emoji based on score
function getEmoji(score) {
    if (score >= 80) return '🟢';
    if (score >= 60) return '🟠';
    if (score >= 40) return '⚪';
    return '🔴';
}

// Get risk level
function getRisk(score) {
    if (score >= 80) return 'LOW';
    if (score >= 60) return 'MEDIUM';
    if (score >= 40) return 'HIGH';
    return 'VERY HIGH';
}

// Scan for new tokens
async function scan() {
    console.log('[LIVE] Scanning Base for new tokens...');
    
    try {
        // Get trending pairs from DexScreener
        const response = await axios.get(
            'https://api.dexscreener.com/latest/dex/pairs/base',
            { timeout: 15000 }
        );
        
        if (!response.data?.pairs) return;
        
        // Filter recent pairs
        const candidates = response.data.pairs
            .filter(pair => {
                const age = (Date.now() - pair.pairCreatedAt) / (1000 * 60 * 60);
                const liq = parseFloat(pair.liquidity?.usd) || 0;
                return age < CONFIG.maxAgeHours && liq >= CONFIG.minLiquidityUSD;
            })
            .sort((a, b) => parseFloat(b.volume?.h24) - parseFloat(a.volume?.h24))
            .slice(0, 5);
        
        let newSignals = 0;
        
        for (const pair of candidates) {
            const tokenAddress = pair.baseToken.address;
            
            // Skip if already tracked
            if (signals.some(s => s.address === tokenAddress)) continue;
            
            const data = {
                address: tokenAddress,
                symbol: pair.baseToken.symbol,
                name: pair.baseToken.name,
                priceUSD: parseFloat(pair.priceUsd) || 0,
                liquidityUSD: parseFloat(pair.liquidity?.usd) || 0,
                volume24h: parseFloat(pair.volume?.h24) || 0,
                volume6h: parseFloat(pair.volume?.h6) || 0,
                volume1h: parseFloat(pair.volume?.h1) || 0,
                volume5m: parseFloat(pair.volume?.m5) || 0,
                marketCap: parseFloat(pair.marketCap) || 0,
                ageHours: (Date.now() - pair.pairCreatedAt) / (1000 * 60 * 60),
                txns24h: pair.txns?.h24 || { buys: 0, sells: 0 },
                pairAddress: pair.pairAddress,
                dex: pair.dexId
            };
            
            const { score, checks } = calculateScore(data);
            
            // Only add if score >= 40
            if (score >= 40) {
                const signal = {
                    id: Date.now().toString(36) + Math.random().toString(36).substr(2),
                    type: 'new_token',
                    emoji: getEmoji(score),
                    score,
                    risk: getRisk(score),
                    checks,
                    ...data,
                    detectedAt: Date.now(),
                    timestamp: new Date().toISOString()
                };
                
                signals.unshift(signal); // Add to beginning
                if (signals.length > 50) signals.pop(); // Keep last 50
                newSignals++;
                
                console.log(`[LIVE] NEW SIGNAL: ${data.symbol} (score: ${score})`);
            }
        }
        
        // Save to file
        fs.writeFileSync(CONFIG.dataFile, JSON.stringify(signals, null, 2));
        
        console.log(`[LIVE] Scan complete. New: ${newSignals}, Total: ${signals.length}`);
        
    } catch (error) {
        console.error('[LIVE] Scan error:', error.message);
    }
}

// Initial scan
scan();

// Schedule scans
setInterval(scan, CONFIG.scanInterval);

console.log('[LIVE] Scanner running — updates every 30s');
console.log('[LIVE] Data file:', CONFIG.dataFile);
