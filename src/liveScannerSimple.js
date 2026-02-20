const axios = require('axios');
const fs = require('fs');

const OUTPUT = './data/allClankerSignals.json';
const CLANKER_API = 'https://clanker.world/api/tokens?limit=30';

const seen = new Set();

function load() {
    try {
        const data = JSON.parse(fs.readFileSync(OUTPUT, 'utf8'));
        data.forEach(t => seen.add((t.contract_address || t.address || '').toLowerCase()));
        console.log(`[LIVE] Loaded ${seen.size} existing tokens`);
    } catch(e) {}
}

async function scan() {
    try {
        const res = await axios.get(CLANKER_API, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 15000
        });
        
        const tokens = res.data?.data || [];
        const newTokens = [];
        
        for (const t of tokens) {
            const addr = (t.contract_address || '').toLowerCase();
            if (!addr || seen.has(addr)) continue;
            
            const ageMin = (Date.now() - new Date(t.deployed_at)) / 60000;
            if (ageMin > 120) continue; // Skip old
            
            seen.add(addr);
            
            const token = {
                symbol: t.symbol,
                name: t.name,
                contract_address: t.contract_address,
                address: t.contract_address,
                detectedAt: Date.now(),
                ageMinutes: Math.floor(ageMin),
                source: ageMin < 15 ? 'live' : 'recent',
                status: 'FRESH',
                liquidityUsd: 0,
                marketCap: 0,
                volume24h: 0,
                url: `https://dexscreener.com/base/${t.contract_address}`
            };
            
            newTokens.push(token);
            console.log(`👁️  ${token.symbol} | ${Math.floor(ageMin)}min old`);
        }
        
        if (newTokens.length > 0) {
            let existing = [];
            try { existing = JSON.parse(fs.readFileSync(OUTPUT, 'utf8')); } catch(e) {}
            const all = [...newTokens, ...existing].slice(0, 200);
            fs.writeFileSync(OUTPUT, JSON.stringify(all, null, 2));
            console.log(`[LIVE] Saved ${newTokens.length} new tokens`);
        }
        
    } catch(e) {
        console.error('[LIVE] Error:', e.message);
    }
}

// Enrich with DexScreener
async function enrich() {
    let tokens = [];
    try { tokens = JSON.parse(fs.readFileSync(OUTPUT, 'utf8')); } catch(e) { return; }
    
    const toEnrich = tokens.filter(t => t.liquidityUsd === 0 && t.ageMinutes < 90);
    if (toEnrich.length === 0) return;
    
    console.log(`[ENRICH] Checking ${toEnrich.length} tokens...`);
    
    let enriched = 0;
    for (const t of toEnrich) {
        try {
            const res = await axios.get(
                `https://api.dexscreener.com/latest/dex/tokens/${t.contract_address}`,
                { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } }
            );
            
            if (res.data?.pairs?.length > 0) {
                const pair = res.data.pairs[0];
                const liq = parseFloat(pair.liquidity?.usd || 0);
                
                if (liq > 0) {
                    t.liquidityUsd = liq;
                    t.marketCap = parseFloat(pair.marketCap || 0);
                    t.volume24h = parseFloat(pair.volume?.h24 || 0);
                    t.priceUsd = parseFloat(pair.priceUsd || 0);
                    t.priceChange5m = parseFloat(pair.priceChange?.m5 || 0);
                    t.dexId = pair.dexId;
                    t.url = pair.url;
                    t.enrichedAt = Date.now();
                    
                    // Score
                    let score = 0;
                    if (liq >= 100000) score += 40;
                    else if (liq >= 50000) score += 30;
                    else if (liq >= 10000) score += 20;
                    
                    const vol5m = parseFloat(pair.volume?.m5 || 0);
                    if (vol5m >= 10000) score += 30;
                    else if (vol5m >= 5000) score += 20;
                    
                    t.score = score;
                    
                    if (score >= 70 && liq >= 50000) {
                        t.status = 'HOT';
                        console.log(`🔥🔥 HOT: $${t.symbol} | Liq: $${liq.toLocaleString()}`);
                    } else if (score >= 40 && liq >= 10000) {
                        t.status = 'WARM';
                        console.log(`⚡ WARM: $${t.symbol} | Liq: $${liq.toLocaleString()}`);
                    } else {
                        t.status = 'COLD';
                        console.log(`✓ ${t.symbol} | Liq: $${liq.toLocaleString()}`);
                    }
                    
                    enriched++;
                }
            }
        } catch(e) {}
        
        await new Promise(r => setTimeout(r, 300));
    }
    
    if (enriched > 0) {
        fs.writeFileSync(OUTPUT, JSON.stringify(tokens, null, 2));
        console.log(`[ENRICH] ${enriched} tokens updated with liquidity`);
    }
}

// Main
console.log('[LIVE] Starting LURKER Live Scanner...');
load();

// Scan every 10s
setInterval(scan, 10000);
scan();

// Enrich every 2min
setInterval(enrich, 120000);
enrich();

console.log('[LIVE] Running: scan every 10s, enrich every 2min');
