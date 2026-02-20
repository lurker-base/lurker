const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * LURKER Rapid Scanner
 * Détecte via Clanker + Enrichit rapidement via DexScreener
 * Affiche UNIQUEMENT quand liquidité > 0
 */

const CONFIG = {
    clankerUrl: 'https://clanker.world/api/tokens?limit=50',
    pollInterval: 10000, // 10s
    enrichInterval: 60000, // 1min enrich all
    
    outputFile: path.join(__dirname, '../data/allClankerSignals.json'),
    pendingFile: path.join(__dirname, '../data/pendingTokens.json'),
};

let allTokens = new Map(); // addr -> token data
let pendingEnrich = []; // tokens to check for liquidity

// Load existing
function loadData() {
    try {
        if (fs.existsSync(CONFIG.outputFile)) {
            const data = JSON.parse(fs.readFileSync(CONFIG.outputFile, 'utf8'));
            data.forEach(t => {
                const addr = (t.contract_address || t.address || '').toLowerCase();
                if (addr) allTokens.set(addr, t);
            });
        }
        console.log(`[RAPID] Loaded ${allTokens.size} tokens`);
    } catch(e) {}
}

// Save
function save() {
    const arr = Array.from(allTokens.values())
        .sort((a, b) => (b.detectedAt || 0) - (a.detectedAt || 0))
        .slice(0, 200);
    fs.writeFileSync(CONFIG.outputFile, JSON.stringify(arr, null, 2));
}

// Fetch Clanker tokens
async function fetchClanker() {
    try {
        const res = await axios.get(CONFIG.clankerUrl, { 
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        const tokens = res.data?.data || [];
        
        let newCount = 0;
        
        for (const t of tokens) {
            const addr = (t.contract_address || '').toLowerCase();
            if (!addr) continue;
            
            const ageMin = (Date.now() - new Date(t.deployed_at)) / 60000;
            
            // Skip if > 2 hours old
            if (ageMin > 120) continue;
            
            if (!allTokens.has(addr)) {
                // New token!
                const token = {
                    symbol: t.symbol,
                    name: t.name,
                    contract_address: t.contract_address,
                    address: t.contract_address,
                    createdAt: t.deployed_at,
                    detectedAt: Date.now(),
                    ageMinutes: Math.floor(ageMin),
                    source: ageMin < 10 ? 'live' : 'recent',
                    liquidityUsd: 0,
                    status: 'FRESH'
                };
                
                allTokens.set(addr, token);
                pendingEnrich.push(token);
                newCount++;
                
                console.log(`👁️ NEW: $${token.symbol} | ${Math.floor(ageMin)}min old`);
            }
        }
        
        if (newCount > 0) {
            console.log(`[RAPID] ${newCount} new tokens (total: ${allTokens.size})`);
            save();
        }
        
    } catch(e) {
        console.error('[RAPID] Clanker error:', e.message);
    }
}

// Enrich tokens with DexScreener data
async function enrichTokens() {
    if (pendingEnrich.length === 0) {
        // Check all tokens without liquidity
        pendingEnrich = Array.from(allTokens.values())
            .filter(t => !(t.liquidityUsd > 0) && t.ageMinutes < 60);
    }
    
    if (pendingEnrich.length === 0) return;
    
    console.log(`\n[ENRICH] Checking ${pendingEnrich.length} tokens...`);
    
    const enriched = [];
    
    for (const token of pendingEnrich) {
        const addr = token.contract_address || token.address;
        
        try {
            const res = await axios.get(
                `https://api.dexscreener.com/latest/dex/tokens/${addr}`,
                { timeout: 8000 }
            );
            
            if (res.data?.pairs?.length > 0) {
                const pair = res.data.pairs.sort((a, b) => 
                    (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
                )[0];
                
                const liq = parseFloat(pair.liquidity?.usd || 0);
                
                if (liq > 0) {
                    // Token has liquidity!
                    const updated = {
                        ...token,
                        liquidityUsd: liq,
                        marketCap: parseFloat(pair.marketCap || 0),
                        volume5m: parseFloat(pair.volume?.m5 || 0),
                        volume1h: parseFloat(pair.volume?.h1 || 0),
                        volume24h: parseFloat(pair.volume?.h24 || 0),
                        priceUsd: parseFloat(pair.priceUsd || 0),
                        priceChange5m: parseFloat(pair.priceChange?.m5 || 0),
                        dexId: pair.dexId,
                        url: pair.url,
                        enrichedAt: Date.now()
                    };
                    
                    // Calculate score
                    let score = 0;
                    if (liq >= 100000) score += 40;
                    else if (liq >= 50000) score += 30;
                    else if (liq >= 10000) score += 20;
                    else score += 10;
                    
                    if (updated.volume5m >= 10000) score += 30;
                    else if (updated.volume5m >= 5000) score += 20;
                    else if (updated.volume5m >= 1000) score += 10;
                    
                    updated.score = score;
                    
                    // Status
                    if (score >= 70 && liq >= 50000) {
                        updated.status = 'HOT';
                        console.log(`🔥🔥🔥 HOT: $${updated.symbol} | Liq: $${liq.toLocaleString()} | ${updated.url}`);
                    } else if (score >= 40 && liq >= 10000) {
                        updated.status = 'WARM';
                        console.log(`⚡ WARM: $${updated.symbol} | Liq: $${liq.toLocaleString()}`);
                    } else {
                        updated.status = 'COLD';
                        console.log(`✓ LIQ: $${updated.symbol} | Liq: $${liq.toLocaleString()}`);
                    }
                    
                    allTokens.set(addr.toLowerCase(), updated);
                    enriched.push(updated);
                }
            }
            
            // Small delay
            await new Promise(r => setTimeout(r, 200));
            
        } catch(e) {
            // Ignore errors
        }
    }
    
    if (enriched.length > 0) {
        console.log(`[ENRICH] ${enriched.length} tokens got liquidity!`);
        save();
    }
    
    // Clear pending (will refill on next cycle if needed)
    pendingEnrich = [];
}

// Main
console.log('[RAPID] LURKER Rapid Scanner Starting...');
loadData();

// Fetch loop (every 10s)
setInterval(fetchClanker, CONFIG.pollInterval);
fetchClanker();

// Enrich loop (every 60s)
setInterval(enrichTokens, CONFIG.enrichInterval);
enrichTokens();

console.log('[RAPID] Scanning every 10s, enriching every 60s...');
