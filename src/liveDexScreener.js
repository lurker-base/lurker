const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * LURKER Live Scanner - DexScreener Edition
 * Trouve les tokens avec liquidité réelle sur Base, créés récemment
 */

const CONFIG = {
    outputFile: path.join(__dirname, '../data/allClankerSignals.json'),
    pollInterval: 30000, // 30s
    maxAgeMinutes: 60,   // Tokens < 60min
    minLiquidity: 5000,  // Minimum $5k liq
    
    // DexScreener API endpoints
    DEXSCREENER_TOP: 'https://api.dexscreener.com/latest/dex/search?q=base',
    DEXSCREENER_PAIRS: 'https://api.dexscreener.com/latest/dex/pairs/base/',
};

let seenTokens = new Set();

// Load existing
function loadExisting() {
    try {
        if (fs.existsSync(CONFIG.outputFile)) {
            const data = JSON.parse(fs.readFileSync(CONFIG.outputFile, 'utf8'));
            data.forEach(t => {
                const addr = t.contract_address || t.address;
                if (addr) seenTokens.add(addr.toLowerCase());
            });
            console.log(`[LIVE] Loaded ${seenTokens.size} existing tokens`);
        }
    } catch(e) {}
}

// Get token info from DexScreener
async function scanLiveTokens() {
    try {
        // Get trending pairs on Base
        const res = await axios.get(CONFIG.DEXSCREENER_TOP, { timeout: 15000 });
        
        if (!res.data?.pairs) {
            console.log('[LIVE] No pairs found');
            return [];
        }
        
        // Filter Base pairs with liquidity
        const basePairs = res.data.pairs.filter(p => 
            p.chainId === 'base' && 
            parseFloat(p.liquidity?.usd || 0) >= CONFIG.minLiquidity
        );
        
        console.log(`[LIVE] Found ${basePairs.length} Base pairs with liquidity`);
        
        const newTokens = [];
        
        for (const pair of basePairs) {
            const baseToken = pair.baseToken;
            const quoteToken = pair.quoteToken;
            
            // Check which token is the "new" one (usually not WETH/USDC)
            const weth = '0x4200000000000000000000000000000000000006'.toLowerCase();
            const usdc = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'.toLowerCase();
            
            let targetToken = baseToken;
            if (baseToken.address.toLowerCase() === weth || baseToken.address.toLowerCase() === usdc) {
                targetToken = quoteToken;
            }
            
            const addr = targetToken.address.toLowerCase();
            
            // Skip if already seen
            if (seenTokens.has(addr)) continue;
            
            // Check pair age (approximate from creation time if available)
            const pairCreated = pair.pairCreatedAt ? new Date(pair.pairCreatedAt) : null;
            const ageMinutes = pairCreated ? (Date.now() - pairCreated) / 60000 : 999;
            
            // Only keep recent pairs
            if (ageMinutes > CONFIG.maxAgeMinutes) continue;
            
            seenTokens.add(addr);
            
            const token = {
                symbol: targetToken.symbol,
                name: targetToken.name,
                address: targetToken.address,
                contract_address: targetToken.address,
                liquidityUsd: parseFloat(pair.liquidity?.usd || 0),
                marketCap: parseFloat(pair.marketCap || 0),
                volume5m: parseFloat(pair.volume?.m5 || 0),
                volume1h: parseFloat(pair.volume?.h1 || 0),
                volume24h: parseFloat(pair.volume?.h24 || 0),
                priceUsd: parseFloat(pair.priceUsd || 0),
                priceChange5m: parseFloat(pair.priceChange?.m5 || 0),
                priceChange1h: parseFloat(pair.priceChange?.h1 || 0),
                priceChange24h: parseFloat(pair.priceChange?.h24 || 0),
                txns5m: (pair.txns?.m5?.buys || 0) + (pair.txns?.m5?.sells || 0),
                txns1h: (pair.txns?.h1?.buys || 0) + (pair.txns?.h1?.sells || 0),
                dexId: pair.dexId,
                url: pair.url,
                ageMinutes: Math.floor(ageMinutes),
                detectedAt: Date.now(),
                source: 'live',
                pairAddress: pair.pairAddress
            };
            
            // Calculate score
            let score = 0;
            if (token.liquidityUsd >= 100000) score += 40;
            else if (token.liquidityUsd >= 50000) score += 30;
            else if (token.liquidityUsd >= 10000) score += 20;
            else score += 10;
            
            if (token.volume5m >= 10000) score += 30;
            else if (token.volume5m >= 5000) score += 20;
            else if (token.volume5m >= 1000) score += 10;
            
            if (token.priceChange5m > 5) score += 15;
            if (token.txns5m >= 20) score += 15;
            if (token.marketCap > 0 && token.marketCap < 1000000) score += 10;
            
            token.score = score;
            
            // Status
            if (score >= 70 && token.liquidityUsd >= 50000 && token.volume5m >= 5000) {
                token.status = 'HOT';
            } else if (score >= 40 && token.liquidityUsd >= 10000) {
                token.status = 'WARM';
            } else {
                token.status = 'COLD';
            }
            
            newTokens.push(token);
            
            const emoji = token.status === 'HOT' ? '🔥' : token.status === 'WARM' ? '⚡' : '👁️';
            console.log(`${emoji} ${token.symbol} | Liq: $${token.liquidityUsd.toLocaleString()} | Score: ${score} | ${token.ageMinutes}min old`);
        }
        
        return newTokens;
        
    } catch(e) {
        console.error('[LIVE] Error:', e.message);
        return [];
    }
}

// Save tokens
function saveTokens(newTokens) {
    if (newTokens.length === 0) return;
    
    let existing = [];
    try {
        existing = JSON.parse(fs.readFileSync(CONFIG.outputFile, 'utf8'));
    } catch(e) {}
    
    // Add new to front
    const all = [...newTokens, ...existing];
    
    // Keep only 200 most recent
    const trimmed = all.slice(0, 200);
    
    fs.writeFileSync(CONFIG.outputFile, JSON.stringify(trimmed, null, 2));
    
    console.log(`[LIVE] Saved ${newTokens.length} new tokens. Total: ${trimmed.length}`);
    
    // Log HOT tokens
    const hot = newTokens.filter(t => t.status === 'HOT');
    if (hot.length > 0) {
        console.log('\n🔥🔥🔥 HOT TOKENS DETECTED:');
        hot.forEach(t => {
            console.log(`   $${t.symbol} - Liq: $${t.liquidityUsd.toLocaleString()} - ${t.url}`);
        });
    }
}

// Main loop
async function loop() {
    console.log('\n' + '='.repeat(60));
    console.log(`[LIVE] Scanning at ${new Date().toLocaleTimeString()}`);
    
    const newTokens = await scanLiveTokens();
    saveTokens(newTokens);
    
    setTimeout(loop, CONFIG.pollInterval);
}

// Start
console.log('[LIVE] DexScreener Live Scanner Starting...');
loadExisting();
loop();
