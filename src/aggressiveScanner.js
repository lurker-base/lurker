const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * LURKER Aggressive Base Scanner
 * Multi-source polling every minute
 */

const CONFIG = {
    dataFile: path.join(__dirname, '../data/aggressiveSignals.json'),
    pollInterval: 60000, // 1 minute
    maxAgeMinutes: 60,   // Last hour
    
    // Sources to check
    sources: [
        { name: 'dexscreener_profiles', url: 'https://api.dexscreener.com/token-profiles/latest/v1' },
        { name: 'dexscreener_base', url: 'https://api.dexscreener.com/latest/dex/search?q=base' },
        { name: 'dexscreener_clanker', url: 'https://api.dexscreener.com/latest/dex/search?q=clanker' },
    ]
};

let signals = [];
let checkCount = 0;

// Load existing
try {
    if (fs.existsSync(CONFIG.dataFile)) {
        signals = JSON.parse(fs.readFileSync(CONFIG.dataFile, 'utf8'));
        if (!Array.isArray(signals)) signals = [];
    }
} catch(e) { signals = []; }

// Check a source
async function checkSource(source) {
    const tokens = [];
    
    try {
        const res = await axios.get(source.url, { timeout: 15000 });
        const data = res.data;
        
        // Handle different response formats
        let pairs = [];
        if (data.pairs) pairs = data.pairs;
        else if (Array.isArray(data)) {
            // Token profiles format
            for (const profile of data) {
                if (profile.chainId === 'base' && profile.tokenAddress) {
                    // Fetch full data for this token
                    try {
                        const tokenRes = await axios.get(
                            `https://api.dexscreener.com/latest/dex/tokens/${profile.tokenAddress}`,
                            { timeout: 10000 }
                        );
                        if (tokenRes.data?.pairs) {
                            pairs.push(...tokenRes.data.pairs.filter(p => p.chainId === 'base'));
                        }
                    } catch(e) {}
                }
            }
        }
        
        // Process pairs
        for (const pair of pairs) {
            if (pair.chainId !== 'base') continue;
            if (!pair.baseToken?.address) continue;
            
            const age = pair.pairCreatedAt 
                ? (Date.now() - pair.pairCreatedAt) / 60000
                : 999;
            
            if (age > CONFIG.maxAgeMinutes) continue;
            
            tokens.push({
                address: pair.baseToken.address,
                symbol: pair.baseToken.symbol,
                name: pair.baseToken.name,
                source: source.name,
                pairAddress: pair.pairAddress,
                dex: pair.dexId,
                age: Math.floor(age),
                ageSeconds: Math.floor(age * 60),
                liquidityUSD: parseFloat(pair.liquidity?.usd || 0),
                volume5m: parseFloat(pair.volume?.m5 || 0),
                volume1h: parseFloat(pair.volume?.h1 || 0),
                priceUSD: parseFloat(pair.priceUsd || 0),
                url: pair.url,
                createdAt: pair.pairCreatedAt
            });
        }
    } catch(e) {
        // Silent
    }
    
    return tokens;
}

// Calculate score
function calculateScore(token) {
    let score = 0;
    
    // Age (key factor)
    if (token.age < 2) score += 50;
    else if (token.age < 5) score += 40;
    else if (token.age < 10) score += 30;
    else if (token.age < 30) score += 20;
    else if (token.age < 60) score += 10;
    
    // Volume
    if (token.volume5m > 10000) score += 30;
    else if (token.volume5m > 5000) score += 20;
    else if (token.volume5m > 1000) score += 10;
    
    // Liquidity
    if (token.liquidityUSD > 50000) score += 20;
    else if (token.liquidityUSD > 10000) score += 10;
    
    return Math.min(100, score);
}

// Main scan
async function scan() {
    checkCount++;
    const allTokens = [];
    
    // Check all sources
    for (const source of CONFIG.sources) {
        const tokens = await checkSource(source);
        allTokens.push(...tokens);
    }
    
    // Deduplicate by address
    const seen = new Set();
    const unique = [];
    for (const t of allTokens) {
        if (!seen.has(t.address)) {
            seen.add(t.address);
            unique.push(t);
        }
    }
    
    // Sort by age
    unique.sort((a, b) => a.age - b.age);
    
    // Find new ones
    let newCount = 0;
    let highScores = [];
    
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
        if (signals.length > 300) signals.pop();
        
        newCount++;
        if (score >= 40) {
            highScores.push(signal);
        }
    }
    
    // Save
    fs.writeFileSync(CONFIG.dataFile, JSON.stringify(signals, null, 2));
    
    // Log summary
    const last1h = signals.filter(s => Date.now() - s.detectedAt < 3600000).length;
    
    if (newCount > 0 || checkCount % 10 === 0) {
        console.log(`[AGGRESSIVE] Check #${checkCount} | New: ${newCount} | Total: ${signals.length} | 1h: ${last1h}`);
    }
    
    // Log high scores
    for (const s of highScores) {
        console.log(`🚨 $${s.symbol} | ${s.age}min | Score: ${s.score} | ${s.url}`);
    }
}

// Run
console.log('[AGGRESSIVE] LURKER Aggressive Scanner');
console.log('[AGGRESSIVE] Checking every minute...\n');

scan();
setInterval(scan, CONFIG.pollInterval);
