const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * LURKER Uniswap Scanner
 * Détecte les nouvelles paires Uniswap V3 sur Base
 */

const CONFIG = {
    apiUrl: 'https://api.dexscreener.com/latest/dex/search',
    dataFile: path.join(__dirname, '../data/uniswapSignals.json'),
    pollInterval: 10000, // 10 secondes
    maxAgeMinutes: 30,   // Tokens < 30 min
    minLiquidity: 5000   // Min $5k liqui
};

let seenPairs = new Set();
let signals = [];

// Load existing
try {
    if (fs.existsSync(CONFIG.dataFile)) {
        signals = JSON.parse(fs.readFileSync(CONFIG.dataFile, 'utf8'));
        signals.slice(0, 200).forEach(s => seenPairs.add(s.pairAddress));
    }
} catch(e) {}

// Calculate score
function calculateScore(pair) {
    let score = 0;
    
    const liq = pair.liquidity?.usd || 0;
    const vol5m = pair.volume?.m5 || 0;
    const vol1h = pair.volume?.h1 || 0;
    const priceChange = pair.priceChange?.h1 || 0;
    const txns = (pair.txns?.h1?.buys || 0) + (pair.txns?.h1?.sells || 0);
    const mcap = pair.marketCap || 0;
    
    // Liquidité
    if (liq >= 100000) score += 30;
    else if (liq >= 50000) score += 25;
    else if (liq >= 30000) score += 20;
    else if (liq >= 10000) score += 15;
    else if (liq >= 5000) score += 10;
    
    // Volume
    if (vol5m >= 10000) score += 25;
    else if (vol5m >= 5000) score += 20;
    else if (vol5m >= 1000) score += 15;
    else if (vol5m >= 500) score += 10;
    
    // Momentum
    if (priceChange > 10) score += 15;
    else if (priceChange > 0) score += 10;
    else if (priceChange < -20) score -= 10;
    
    // Activité
    if (txns >= 50) score += 15;
    else if (txns >= 20) score += 10;
    else if (txns >= 10) score += 5;
    
    // Market cap
    if (mcap > 0 && mcap < 1000000) score += 5; // Microcap bonus
    
    return Math.min(100, Math.max(0, score));
}

// Scan Uniswap pairs
async function scanUniswap() {
    try {
        // Cherche les paires récentes sur Base
        // On utilise une recherche wildcard pour trouver tout
        const res = await axios.get(CONFIG.apiUrl, {
            params: { 
                q: '',
                chainId: 'base'
            },
            timeout: 15000
        });
        
        const pairs = res.data?.pairs || [];
        let newCount = 0;
        
        for (const pair of pairs) {
            // Filtre Uniswap seulement
            if (!pair.dexId || !pair.dexId.toLowerCase().includes('uniswap')) continue;
            
            // Skip si déjà vu
            if (seenPairs.has(pair.pairAddress)) continue;
            seenPairs.add(pair.pairAddress);
            
            // Vérifie age
            const pairCreated = pair.pairCreatedAt ? new Date(pair.pairCreatedAt) : null;
            if (!pairCreated) continue;
            
            const ageMinutes = (Date.now() - pairCreated) / 60000;
            if (ageMinutes > CONFIG.maxAgeMinutes) continue;
            
            // Vérifie liquidité minimum
            const liquidity = pair.liquidity?.usd || 0;
            if (liquidity < CONFIG.minLiquidity) continue;
            
            // Score
            const score = calculateScore(pair);
            
            const signal = {
                id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                symbol: pair.baseToken?.symbol || 'UNKNOWN',
                name: pair.baseToken?.name || '',
                contract_address: pair.baseToken?.address || '',
                pairAddress: pair.pairAddress,
                dexId: pair.dexId,
                ageMinutes: Math.floor(ageMinutes * 10) / 10,
                liquidityUsd: liquidity,
                volume5m: pair.volume?.m5 || 0,
                volume1h: pair.volume?.h1 || 0,
                volume24h: pair.volume?.h24 || 0,
                priceChange5m: pair.priceChange?.m5 || 0,
                priceChange1h: pair.priceChange?.h1 || 0,
                priceChange24h: pair.priceChange?.h24 || 0,
                marketCap: pair.marketCap || 0,
                fdv: pair.fdv || 0,
                txns1h: (pair.txns?.h1?.buys || 0) + (pair.txns?.h1?.sells || 0),
                score,
                status: score >= 70 ? 'HOT' : score >= 40 ? 'WARM' : 'LOW',
                url: pair.url,
                detectedAt: Date.now()
            };
            
            signals.unshift(signal);
            if (signals.length > 500) signals.pop();
            
            newCount++;
            
            // Log si intéressant
            if (score >= 60) {
                console.log(`🚨 [UNISWAP] $${signal.symbol} | ${Math.floor(ageMinutes)}min | Score: ${score} | Liq: $${(liquidity/1000).toFixed(1)}k`);
            }
        }
        
        if (newCount > 0) {
            fs.writeFileSync(CONFIG.dataFile, JSON.stringify(signals, null, 2));
            console.log(`[UNISWAP] +${newCount} pairs | Total: ${signals.length}`);
        }
        
    } catch(e) {
        console.error('[UNISWAP] Error:', e.message);
    }
}

// Alternative: Scan via query spécifique DAI/WETH/etc pour trouver nouvelles paires
async function scanNewPairs() {
    // Cette fonction pourrait utiliser un RPC pour écouter les events PoolCreated
    // Pour l'instant on utilise DexScreener comme workaround
}

// Start
console.log('[UNISWAP] LURKER Uniswap Scanner');
console.log('[UNISWAP] Max age: 30min | Min liq: $5k');
console.log('[UNISWAP] Checking every 10s...\n');

scanUniswap();
setInterval(scanUniswap, CONFIG.pollInterval);
