#!/usr/bin/env node
// LURKER Liquidity-First Scanner
// Détecte les tokens avec liquidité confirmée

const fs = require('fs');
const https = require('https');

const DATA_FILE = 'data/allClankerSignals.json';
const now = Date.now();

console.log('[LIQ-SCAN] LURKER Liquidity-First Scanner');
console.log('[LIQ-SCAN]', new Date().toLocaleTimeString(), '- Fetching tokens with confirmed liquidity...');

// Charger données existantes
let existing = [];
try {
  existing = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
} catch(e) {
  existing = [];
}

const existingMap = new Map(existing.map(t => [t.contract_address || t.address, t]));

// Récupérer données DexScreener
const options = {
  hostname: 'api.dexscreener.com',
  path: '/latest/dex/tokens/0x4200000000000000000000000000000000000006',
  headers: {
    'User-Agent': 'Mozilla/5.0'
  }
};

const req = https.get(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      const pairs = json.pairs || [];
      
      // Filtrer paires Base récentes
      const basePairs = pairs.filter(p => 
        p.chainId === 'base' && 
        ['uniswap', 'aerodrome', 'baseswap'].includes(p.dexId)
      );
      
      let newTokens = 0;
      let updatedTokens = 0;
      let hotTokens = [];
      
      basePairs.forEach(pair => {
        const token = pair.baseToken;
        if (!token || token.address === '0x4200000000000000000000000000000000000006') return;
        
        const pairCreated = pair.pairCreatedAt || now;
        const ageHours = (now - pairCreated) / (1000 * 60 * 60);
        
        const liq = parseFloat(pair.liquidity?.usd || 0);
        const mcap = parseFloat(pair.fdv || pair.marketCap || 0);
        const vol24h = parseFloat(pair.volume?.h24 || 0);
        const vol5m = parseFloat(pair.volume?.m5 || 0);
        const txns5m = (pair.txns?.m5?.buys || 0) + (pair.txns?.m5?.sells || 0);
        
        // CRITÈRE: < 2h et liq > 10k
        if (ageHours < 2 && liq > 10000) {
          const addr = token.address;
          const existingToken = existingMap.get(addr);
          
          const tokenData = {
            symbol: token.symbol,
            name: token.name,
            contract_address: addr,
            pairAddress: pair.pairAddress,
            dexId: pair.dexId,
            ageHours: Math.round(ageHours * 100) / 100,
            liquidityUsd: Math.round(liq * 100) / 100,
            marketCap: Math.round(mcap * 100) / 100,
            volume24h: Math.round(vol24h * 100) / 100,
            volume5m: Math.round(vol5m * 100) / 100,
            txns5m: txns5m,
            priceUsd: pair.priceUsd,
            priceChange24h: pair.priceChange?.h24,
            priceChange5m: pair.priceChange?.m5,
            detectedAt: existingToken?.detectedAt || now,
            enrichedAt: now,
            source: existingToken?.source || 'liquidity-scan',
            hasLiquidity: true,
            url: `https://dexscreener.com/base/${pair.pairAddress}`
          };
          
          // Calculer un score
          let score = 0;
          if (liq >= 50000) score += 30;
          else if (liq >= 20000) score += 20;
          else score += 10;
          
          if (vol5m >= 5000) score += 25;
          else if (vol5m >= 1000) score += 15;
          
          if (txns5m >= 30) score += 25;
          else if (txns5m >= 10) score += 15;
          
          if (pair.priceChange?.m5 > 10) score += 10;
          
          if (ageHours < 0.5) score += 10;
          
          tokenData.score = score;
          tokenData.status = score >= 70 ? 'HOT' : score >= 40 ? 'WARM' : 'COLD';
          
          if (score >= 70) {
            hotTokens.push(`${token.symbol}(score:${score})`);
          }
          
          if (existingToken) {
            Object.assign(existingToken, tokenData);
            updatedTokens++;
          } else {
            existing.push(tokenData);
            newTokens++;
            console.log(`[NEW-LIQ] ${token.symbol} - $${Math.round(liq).toLocaleString()} liq - ${Math.round(ageHours * 60)}min - Score:${score}`);
          }
          
          existingMap.set(addr, tokenData);
        }
      });
      
      // Sauvegarder
      fs.writeFileSync(DATA_FILE, JSON.stringify(existing, null, 2));
      
      console.log(`[LIQ-SCAN] Added: ${newTokens} | Updated: ${updatedTokens} | Total: ${existing.length}`);
      if (hotTokens.length > 0) {
        console.log(`[LIQ-SCAN] HOT tokens: ${hotTokens.join(', ')}`);
      }
      console.log('[LIQ-SCAN] Done');
      
    } catch (err) {
      console.error('[LIQ-SCAN] Error:', err.message);
      process.exit(1);
    }
  });
});

req.on('error', (err) => {
  console.error('[LIQ-SCAN] Request failed:', err.message);
  process.exit(1);
});
