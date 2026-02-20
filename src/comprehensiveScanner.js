const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * LURKER Comprehensive Base Scanner
 * Detects ALL new tokens on Base, not just factory events
 */

const CONFIG = {
    dataFile: path.join(__dirname, '../data/comprehensiveSignals.json'),
    pollInterval: 10000, // 10 seconds
    maxAgeMinutes: 30,   // Tokens created in last 30 min
    minLiquidityUSD: 100, // $100 minimum
    
    // Search strategies
    strategies: [
        { name: 'clanker', query: 'clanker base' },
        { name: 'bankr', query: 'bankr base' },
        { name: 'base_new', query: 'base token' },
        { name: 'base_fresh', query: 'base mainnet' },
        { name: 'microcap', query: 'base microcap' },
    ],
    
    // Blacklist
    blacklist: [
        '0x4200000000000000000000000000000000000006', // WETH
        '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
        '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', // DAI
        '0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22', // cbETH
    ]
};

let signals = [];
let lastCheck = Date.now();

// Load existing
try {
    if (fs.existsSync(CONFIG.dataFile)) {
        signals = JSON.parse(fs.readFileSync(CONFIG.dataFile, 'utf8'));
        if (!Array.isArray(signals)) signals = [];
    }
} catch(e) { signals = []; }

// Search for tokens
async function searchTokens(strategy) {
    const tokens = new Map();
    
    try {
        const res = await axios.get(
            `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(strategy.query)}`,
            { timeout: 15000 }
        );
        
        if (!res.data?.pairs) return [];
        
        for (const pair of res.data.pairs) {
            // Filter for Base only
            if (pair.chainId !== 'base') continue;
            
            const token = pair.baseToken;
            if (!token?.address) continue;
            
            // Skip blacklisted
            if (CONFIG.blacklist.includes(token.address.toLowerCase())) continue;
            
            // Calculate age
            const age = pair.pairCreatedAt 
                ? (Date.now() - pair.pairCreatedAt) / 60000 // minutes
                : 999;
            
            // Skip old tokens
            if (age > CONFIG.maxAgeMinutes) continue;
            
            const liq = parseFloat(pair.liquidity?.usd || 0);
            if (liq < CONFIG.minLiquidityUSD) continue;
            
            const key = token.address;
            if (!tokens.has(key) || tokens.get(key).age > age) {
                tokens.set(key, {
                    address: token.address,
                    symbol: token.symbol,
                    name: token.name,
                    source: strategy.name,
                    pairAddress: pair.pairAddress,
                    dex: pair.dexId,
                    age: age, // minutes
                    ageSeconds: Math.floor(age * 60),
                    liquidityUSD: liq,
                    volume24h: parseFloat(pair.volume?.h24 || 0),
                    volume1h: parseFloat(pair.volume?.h1 || 0),
                    volume5m: parseFloat(pair.volume?.m5 || 0),
                    marketCap: parseFloat(pair.marketCap || 0),
                    priceUSD: parseFloat(pair.priceUsd || 0),
                    url: pair.url,
                    createdAt: pair.pairCreatedAt
                });
            }
        }
    } catch(e) {
        // Silent fail
    }
    
    return [...tokens.values()];
}

// Calculate score
function calculateScore(token) {
    let score = 0;
    
    // NEW token (seconds old!)
    if (token.age < 2) score += 40;      // < 2 min
    else if (token.age < 5) score += 30; // < 5 min
    else if (token.age < 10) score += 20; // < 10 min
    else if (token.age < 30) score += 10; // < 30 min
    
    // Volume activity
    if (token.volume5m > 5000) score += 25;
    else if (token.volume5m > 1000) score += 15;
    else if (token.volume5m > 100) score += 10;
    
    // Liquidity
    if (token.liquidityUSD > 50000) score += 20;
    else if (token.liquidityUSD > 10000) score += 15;
    else if (token.liquidityUSD > 5000) score += 10;
    else if (token.liquidityUSD > 1000) score += 5;
    
    // Market cap
    if (token.marketCap > 0 && token.marketCap < 1000000) score += 5; // Microcap
    
    return Math.min(100, score);
}

// Main scan
async function scan() {
    const allTokens = [];
    
    // Try each strategy
    for (const strategy of CONFIG.strategies) {
        try {
            const tokens = await searchTokens(strategy);
            allTokens.push(...tokens);
        } catch(e) {}
    }
    
    // Remove duplicates
    const seen = new Set();
    const unique = [];
    for (const t of allTokens) {
        if (!seen.has(t.address)) {
            seen.add(t.address);
            unique.push(t);
        }
    }
    
    // Sort by age (newest first)
    unique.sort((a, b) => a.age - b.age);
    
    // Check for new signals
    let newCount = 0;
    for (const token of unique) {
        if (signals.some(s => s.address === token.address)) continue;
        
        const score = calculateScore(token);
        
        const signal = {
            ...token,
            score,
            id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            detectedAt: Date.now(),
            timestamp: new Date().toISOString()
        };
        
        signals.unshift(signal);
        if (signals.length > 200) signals.pop();
        
        newCount++;
        
        // Log only high scores
        if (score >= 40) {
            console.log(`🚨 $${token.symbol} | ${Math.floor(token.age)}min old | Score: ${score} | Liq: $${(token.liquidityUSD/1000).toFixed(1)}k`);
        }
    }
    
    // Save
    fs.writeFileSync(CONFIG.dataFile, JSON.stringify(signals, null, 2));
    
    // Summary
    const last1h = signals.filter(s => Date.now() - s.detectedAt < 3600000).length;
    if (newCount > 0) {
        console.log(`[SCAN] Found ${newCount} new | Total: ${signals.length} | 1h: ${last1h}`);
    }
}

// Run
console.log('[COMPREHENSIVE] LURKER Base Scanner v2');
console.log('[COMPREHENSIVE] Checking all strategies every 10s...\n');

scan();
setInterval(scan, CONFIG.pollInterval);
