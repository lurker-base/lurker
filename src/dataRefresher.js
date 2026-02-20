#!/usr/bin/env node
// LURKER Data Refresher
// Met à jour les tokens existants avec les données DexScreener fraîches

const fs = require('fs');
const https = require('https');

const DATA_FILE = 'data/allClankerSignals.json';
const now = Date.now();

console.log('[REFRESH] LURKER Data Refresher');
console.log('[REFRESH]', new Date().toLocaleTimeString());

let tokens = [];
try { tokens = JSON.parse(fs.readFileSync(DATA_FILE)); } catch(e) {
  console.log('[REFRESH] No existing data');
  process.exit(0);
}

console.log(`[REFRESH] Refreshing ${tokens.length} tokens...`);

let updated = 0;
let errors = 0;

async function refreshToken(token, index) {
  const addr = token.contract_address || token.address;
  if (!addr) return;
  
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.dexscreener.com',
      path: `/latest/dex/tokens/${addr}`,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    };
    
    const req = https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const pairs = json.pairs || [];
          
          // Trouver la meilleure paire Base
          const basePairs = pairs.filter(p => p.chainId === 'base');
          if (basePairs.length === 0) {
            resolve();
            return;
          }
          
          const best = basePairs.sort((a, b) => 
            parseFloat(b.liquidity?.usd || 0) - parseFloat(a.liquidity?.usd || 0)
          )[0];
          
          const liq = parseFloat(best.liquidity?.usd || 0);
          if (liq > 0) {
            token.liquidityUsd = Math.round(liq * 100) / 100;
            token.marketCap = Math.round(parseFloat(best.fdv || best.marketCap || 0) * 100) / 100;
            token.volume24h = Math.round(parseFloat(best.volume?.h24 || 0) * 100) / 100;
            token.volume5m = Math.round(parseFloat(best.volume?.m5 || 0) * 100) / 100;
            token.txns5m = (best.txns?.m5?.buys || 0) + (best.txns?.m5?.sells || 0);
            token.priceUsd = best.priceUsd;
            token.priceChange5m = best.priceChange?.m5;
            token.priceChange24h = best.priceChange?.h24;
            token.enrichedAt = now;
            token.hasLiquidity = true;
            token.url = `https://dexscreener.com/base/${best.pairAddress}`;
            
            // Recalculer score
            let score = 0;
            if (liq >= 500000) score += 50;
            else if (liq >= 100000) score += 40;
            else if (liq >= 50000) score += 35;
            else if (liq >= 20000) score += 30;
            else if (liq >= 10000) score += 25;
            else if (liq >= 5000) score += 20;
            else score += 10;
            
            const vol5m = token.volume5m || 0;
            if (vol5m >= 20000) score += 30;
            else if (vol5m >= 10000) score += 25;
            else if (vol5m >= 5000) score += 20;
            else if (vol5m >= 1000) score += 10;
            
            const txns = token.txns5m || 0;
            if (txns >= 100) score += 20;
            else if (txns >= 50) score += 15;
            else if (txns >= 20) score += 10;
            
            token.score = score;
            token.status = score >= 70 ? 'HOT' : score >= 40 ? 'WARM' : liq > 10000 ? 'COLD' : 'FRESH';
            
            updated++;
            if (score >= 70) {
              console.log(`[REFRESH] ${token.symbol}: $${Math.round(liq/1000)}k liq | Score: ${score} 🔥`);
            }
          }
          
        } catch(e) {}
        resolve();
      });
    });
    
    req.on('error', () => { errors++; resolve(); });
    req.setTimeout(10000, () => { req.destroy(); resolve(); });
  });
}

async function main() {
  // Traiter par lots de 5 pour ne pas surcharger
  for (let i = 0; i < tokens.length; i += 5) {
    const batch = tokens.slice(i, i + 5);
    await Promise.all(batch.map((t, idx) => refreshToken(t, i + idx)));
    
    // Petit délai entre les lots
    if (i + 5 < tokens.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  
  fs.writeFileSync(DATA_FILE, JSON.stringify(tokens, null, 2));
  
  const withLiq = tokens.filter(t => (t.liquidityUsd || 0) > 0).length;
  const hot = tokens.filter(t => t.status === 'HOT').length;
  const warm = tokens.filter(t => t.status === 'WARM').length;
  
  console.log(`[REFRESH] Done:`);
  console.log(`  Updated: ${updated}`);
  console.log(`  With liquidity: ${withLiq}/${tokens.length}`);
  console.log(`  HOT: ${hot} | WARM: ${warm}`);
}

main();
