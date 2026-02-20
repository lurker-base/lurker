const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * LURKER Base Scanner (All DEXs)
 * Détecte les nouveaux tokens sur tous les DEX de Base
 */

const CONFIG = {
    // Plusieurs endpoints pour maximiser la couverture
    endpoints: [
        'https://api.dexscreener.com/latest/dex/tokens/0x4200000000000000000000000000000000000006', // WETH pairs
        'https://api.dexscreener.com/latest/dex/tokens/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC pairs
    ],
    dataFile: path.join(__dirname, '../data/baseAllSignals.json'),
    pollInterval: 15000, // 15 secondes
    maxAgeMinutes: 60,   // Tokens < 60 min
    minLiquidity: 3000
};

let seenTokens = new Set();
let signals = [];

// Load existing
try {
    if (fs.existsSync(CONFIG.dataFile)) {
        signals = JSON.parse(fs.readFileSync(CONFIG.dataFile, 'utf8'));
        signals.slice(0, 300).forEach(s => seenTokens.add(s.contract_address));
    }
} catch(e) {}

// Calculate score
function calculateScore(pair) {
    let score = 0;
    
    const liq = pair.liquidity?.usd || 0;
    const vol5m = pair.volume?.m5 || 0;
    const vol1h = pair.volume?.h1 || 0;
    const priceChange = pair.priceChange?.m5 || 0;
    const mcap = pair.marketCap || 0;
    
    // Liquidité (40 points max)
    if (liq >= 100000) score += 40;
    else if (liq >= 50000) score += 35;
    else if (liq >= 30000) score += 30;
    else if (liq >= 10000) score += 25;
    else if (liq >= 5000) score += 20;
    else if (liq >= 3000) score += 15;
    
    // Volume (30 points max)
    if (vol5m >= 10000) score += 30;
    else if (vol5m >= 5000) score += 25;
    else if (vol5m >= 1000) score += 20;
    else if (vol5m >= 500) score += 15;
    else if (vol5m >= 100) score += 10;
    
    // Momentum (20 points max)
    if (priceChange > 50) score += 20;
    else if (priceChange > 20) score += 15;
    else if (priceChange > 10) score += 10;
    else if (priceChange > 0) score += 5;
    
    // Market cap (10 points max)
    if (mcap > 0 && mcap < 500000) score += 10; // Microcap
    else if (mcap > 0 && mcap < 1000000) score += 5;
    
    return Math.min(100, score);
}

// Scan un endpoint
async function scanEndpoint(url) {
    try {
        const res = await axios.get(url, { timeout: 15000 });
        return res.data?.pairs || [];
    } catch(e) {
        return [];
    }
}

// Main scan
async function scan() {
    let allPairs = [];
    
    // Récupère toutes les paires
    for (const endpoint of CONFIG.endpoints) {
        const pairs = await scanEndpoint(endpoint);
        allPairs = allPairs.concat(pairs);
    }
    
    // Filtre et process
    let newCount = 0;
    
    for (const pair of allPairs) {
        // Uniquement Base
        if (pair.chainId !== 'base') continue;
        
        // Récupère le token (pas WETH ni USDC)
        const weth = '0x4200000000000000000000000000000000000006'.toLowerCase();
        const usdc = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'.toLowerCase();
        
        let token = null;
        if (pair.baseToken?.address?.toLowerCase() !== weth && pair.baseToken?.address?.toLowerCase() !== usdc) {
            token = pair.baseToken;
        } else if (pair.quoteToken?.address?.toLowerCase() !== weth && pair.quoteToken?.address?.toLowerCase() !== usdc) {
            token = pair.quoteToken;
        }
        
        if (!token) continue;
        
        const tokenAddress = token.address;
        
        // Skip si déjà vu
        if (seenTokens.has(tokenAddress)) continue;
        seenTokens.add(tokenAddress);
        
        // Vérifie age
        const pairCreated = pair.pairCreatedAt ? new Date(pair.pairCreatedAt) : null;
        if (!pairCreated) continue;
        
        const ageMinutes = (Date.now() - pairCreated) / 60000;
        if (ageMinutes > CONFIG.maxAgeMinutes) continue;
        
        // Vérifie liquidité
        const liquidity = pair.liquidity?.usd || 0;
        if (liquidity < CONFIG.minLiquidity) continue;
        
        // Score
        const score = calculateScore(pair);
        
        const signal = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            symbol: token.symbol || 'UNKNOWN',
            name: token.name || '',
            contract_address: tokenAddress,
            pairAddress: pair.pairAddress,
            dexId: pair.dexId,
            ageMinutes: Math.floor(ageMinutes * 10) / 10,
            liquidityUsd: liquidity,
            volume5m: pair.volume?.m5 || 0,
            volume1h: pair.volume?.h1 || 0,
            volume24h: pair.volume?.h24 || 0,
            priceChange5m: pair.priceChange?.m5 || 0,
            priceChange1h: pair.priceChange?.h1 || 0,
            marketCap: pair.marketCap || 0,
            score,
            status: score >= 70 ? '🔥 HOT' : score >= 50 ? '⚡ WARM' : score >= 30 ? '📊 MID' : '💀 LOW',
            url: pair.url,
            detectedAt: Date.now()
        };
        
        signals.unshift(signal);
        if (signals.length > 500) signals.pop();
        
        newCount++;
        
        // Log si bon score
        if (score >= 50) {
            console.log(`${signal.status} $${signal.symbol} | ${Math.floor(ageMinutes)}min | Score: ${score} | ${pair.dexId}`);
        }
    }
    
    if (newCount > 0) {
        fs.writeFileSync(CONFIG.dataFile, JSON.stringify(signals, null, 2));
        console.log(`[BASE-ALL] +${newCount} tokens | Total: ${signals.length}`);
    }
}

// Start
console.log('[BASE-ALL] LURKER Base Scanner (All DEXs)');
console.log('[BASE-ALL] Watching WETH & USDC pairs');
console.log('[BASE-ALL] Max age: 60min | Min liq: $3k');
console.log('[BASE-ALL] Checking every 15s...\n');

scan();
setInterval(scan, CONFIG.pollInterval);
