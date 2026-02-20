#!/bin/bash
cd /data/.openclaw/workspace/lurker-project
node -e "
const fs = require('fs');
const axios = require('axios');

const OUTPUT = './data/allClankerSignals.json';

async function enrich() {
    let tokens = [];
    try { tokens = JSON.parse(fs.readFileSync(OUTPUT, 'utf8')); } catch(e) { return; }
    
    const toEnrich = tokens.filter(t => t.liquidityUsd === 0 && t.ageMinutes < 90);
    if (toEnrich.length === 0) return;
    
    console.log('[ENRICH] Checking ' + toEnrich.length + ' tokens...');
    let updated = 0;
    
    for (const t of toEnrich) {
        try {
            const res = await axios.get('https://api.dexscreener.com/latest/dex/tokens/' + t.contract_address, {
                timeout: 10000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            
            if (res.data?.pairs?.length > 0) {
                const p = res.data.pairs[0];
                const liq = parseFloat(p.liquidity?.usd || 0);
                if (liq > 0) {
                    t.liquidityUsd = liq;
                    t.marketCap = parseFloat(p.marketCap || 0);
                    t.volume24h = parseFloat(p.volume?.h24 || 0);
                    t.priceUsd = parseFloat(p.priceUsd || 0);
                    t.url = p.url;
                    
                    let score = 0;
                    if (liq >= 100000) score += 40;
                    else if (liq >= 50000) score += 30;
                    else if (liq >= 10000) score += 20;
                    
                    const vol5m = parseFloat(p.volume?.m5 || 0);
                    if (vol5m >= 10000) score += 30;
                    else if (vol5m >= 5000) score += 20;
                    
                    t.score = score;
                    t.status = (score >= 70 && liq >= 50000) ? 'HOT' : (score >= 40 && liq >= 10000) ? 'WARM' : 'COLD';
                    
                    const emoji = t.status === 'HOT' ? '🔥' : t.status === 'WARM' ? '⚡' : '✓';
                    console.log(emoji + ' ' + t.symbol + ' | Liq: $' + liq.toLocaleString());
                    updated++;
                }
            }
        } catch(e) {}
        await new Promise(r => setTimeout(r, 400));
    }
    
    if (updated > 0) {
        fs.writeFileSync(OUTPUT, JSON.stringify(tokens, null, 2));
        console.log('[ENRICH] ' + updated + ' tokens updated');
    }
}

enrich();
"
