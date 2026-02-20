#!/usr/bin/env node
// LURKER Base Top Tokens Scanner
// Recherche les meilleurs tokens Base récents

const fs = require('fs');
const https = require('https');

const DATA_FILE = 'data/allClankerSignals.json';
const now = Date.now();

console.log('[BASE-SCAN] LURKER Base Scanner');
console.log('[BASE-SCAN]', new Date().toLocaleTimeString(), '- Searching Base recent tokens...');

// Charger données existantes
let existing = [];
try {
  existing = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
} catch(e) {
  existing = [];
}

const existingMap = new Map(existing.map(t => [t.contract_address || t.address, t]));

// Fonction pour chercher sur DexScreener
function searchBaseTokens() {
  return new Promise((resolve, reject) => {
    // Chercher "base" pour obtenir les paires récentes
    const options = {
      hostname: 'api.dexscreener.com',
      path: '/latest/dex/search?q=base',
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
          resolve(json.pairs || []);
        } catch(e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

// Chercher aussi les tokens avec "WETH" sur Base
function searchWETHPairs() {
  return new Promise((resolve, reject) => {
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
          resolve(json.pairs || []);
        } catch(e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

async function main() {
  try {
    const [searchPairs, wethPairs] = await Promise.all([
      searchBaseTokens().catch(() => []),
      searchWETHPairs().catch(() => [])
    ]);
    
    // Combiner et dédupliquer
    const allPairs = [...searchPairs, ...wethPairs];
    const seenPairs = new Set();
    const uniquePairs = [];
    
    allPairs.forEach(pair => {
      if (pair.chainId === 'base' && !seenPairs.has(pair.pairAddress)) {
        seenPairs.add(pair.pairAddress);
        uniquePairs.push(pair);
      }
    });
    
    console.log(`[BASE-SCAN] Found ${uniquePairs.length} unique Base pairs`);
    
    let newTokens = 0;
    let updatedTokens = 0;
    let hotTokens = [];
    let daimonUpdated = false;
    
    uniquePairs.forEach(pair => {
      const token = pair.baseToken;
      if (!token) return;
      
      const pairCreated = pair.pairCreatedAt || now;
      const ageHours = (now - pairCreated) / (1000 * 60 * 60);
      
      const liq = parseFloat(pair.liquidity?.usd || 0);
      const mcap = parseFloat(pair.fdv || pair.marketCap || 0);
      
      // Vérifier si c'est DAIMON
      const isDaimon = token.address?.toLowerCase() === '0x98c51C8E958ccCD37F798b2B9332d148E2c05D57'.toLowerCase();
      
      // CRITÈRE: < 3h et liq > 5k (ou DAIMON)
      if ((ageHours < 3 && liq > 5000) || isDaimon) {
        const addr = token.address;
        const existingToken = existingMap.get(addr);
        
        const vol5m = parseFloat(pair.volume?.m5 || 0);
        const vol1h = parseFloat(pair.volume?.h1 || 0);
        const vol24h = parseFloat(pair.volume?.h24 || 0);
        const txns5m = (pair.txns?.m5?.buys || 0) + (pair.txns?.m5?.sells || 0);
        const txns1h = (pair.txns?.h1?.buys || 0) + (pair.txns?.h1?.sells || 0);
        
        const tokenData = {
          symbol: token.symbol,
          name: token.name,
          contract_address: addr,
          pairAddress: pair.pairAddress,
          dexId: pair.dexId,
          ageHours: Math.round(ageHours * 100) / 100,
          liquidityUsd: Math.round(liq * 100) / 100,
          marketCap: Math.round(mcap * 100) / 100,
          volume5m: Math.round(vol5m * 100) / 100,
          volume1h: Math.round(vol1h * 100) / 100,
          volume24h: Math.round(vol24h * 100) / 100,
          txns5m: txns5m,
          txns1h: txns1h,
          priceUsd: pair.priceUsd,
          priceChange5m: pair.priceChange?.m5,
          priceChange1h: pair.priceChange?.h1,
          priceChange24h: pair.priceChange?.h24,
          detectedAt: existingToken?.detectedAt || now,
          enrichedAt: now,
          source: existingToken?.source || 'base-scan',
          hasLiquidity: liq > 0,
          url: `https://dexscreener.com/base/${pair.pairAddress}`
        };
        
        // Calculer score
        let score = 0;
        if (liq >= 100000) score += 40;
        else if (liq >= 50000) score += 30;
        else if (liq >= 20000) score += 20;
        else if (liq >= 10000) score += 15;
        else score += 10;
        
        if (vol5m >= 10000) score += 30;
        else if (vol5m >= 5000) score += 20;
        else if (vol5m >= 1000) score += 10;
        
        if (txns5m >= 50) score += 20;
        else if (txns5m >= 20) score += 15;
        else if (txns5m >= 5) score += 10;
        
        if (pair.priceChange?.m5 > 50) score += 10;
        else if (pair.priceChange?.m5 > 10) score += 5;
        
        if (ageHours < 1) score += 10;
        
        tokenData.score = score;
        tokenData.status = score >= 70 ? 'HOT' : score >= 40 ? 'WARM' : 'COLD';
        
        if (score >= 70) {
          hotTokens.push(`${token.symbol}(score:${score},liq:$${Math.round(liq/1000)}k)`);
        }
        
        if (existingToken) {
          Object.assign(existingToken, tokenData);
          updatedTokens++;
          if (isDaimon) {
            daimonUpdated = true;
            console.log(`[DAIMON-UPDATE] ${token.symbol} - $${Math.round(liq).toLocaleString()} liq - $${Math.round(mcap/1000000*100)/100}M mcap`);
          }
        } else {
          existing.push(tokenData);
          newTokens++;
          console.log(`[NEW] ${token.symbol} - $${Math.round(liq).toLocaleString()} liq - ${Math.round(ageHours * 60)}min`);
        }
        
        existingMap.set(addr, tokenData);
      }
    });
    
    // Sauvegarder
    fs.writeFileSync(DATA_FILE, JSON.stringify(existing, null, 2));
    
    console.log(`[BASE-SCAN] Added: ${newTokens} | Updated: ${updatedTokens} | Total: ${existing.length}`);
    if (hotTokens.length > 0) {
      console.log(`[BASE-SCAN] HOT tokens: ${hotTokens.join(', ')}`);
    }
    if (!daimonUpdated) {
      console.log('[BASE-SCAN] Warning: DAIMON not found in scan');
    }
    console.log('[BASE-SCAN] Done');
    
  } catch (err) {
    console.error('[BASE-SCAN] Error:', err.message);
    process.exit(1);
  }
}

main();
